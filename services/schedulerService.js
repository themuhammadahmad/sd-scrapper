// services/schedulerService.js
import cron from 'node-cron';
import fs from 'fs';
import processStaffDirectory from "../utils/processStaffDirectory.js";
import puppeteerManager from '../fallback/puppeteerParser.js';
import StaffDirectory from '../models/StaffDirectory.js';
import FailedDirectory from '../models/FailedDirectory.js';
import { fileURLToPath } from 'url';
import path from 'path';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class SchedulerService {
  constructor() {
    this.isRunning = false;
    this.currentJob = null;
    this.shouldStop = false;
    this.currentProcess = null;
    this.lastProcessedIndex = 0;
    this.directories = [];
    this.successCount = 0;
    this.errorCount = 0;
  }

  startMonthlyScraping() {
    // Run on the 1st day of every month at 2:00 AM
    this.currentJob = cron.schedule('0 2 1 * *', () => {
      console.log('🚀 Starting monthly automated scraping cycle...');
      this.runScrapingCycle();
    }, {
      scheduled: true,
      timezone: "America/New_York"
    });

    console.log('✅ Monthly scraping scheduler started (will run on 1st of every month at 2:00 AM)');
  }

  async runScrapingCycle() {
    // IMPORTANT: Check if already running at the very beginning
    if (this.isRunning) {
      console.log('⚠️ Scraping cycle already running, skipping...');
      return Promise.resolve(); // Return a resolved promise instead
    }

    this.isRunning = true;
    this.shouldStop = false;
    this.successCount = 0;
    this.errorCount = 0;

    try {
      // Fetch active directories from database
      this.directories = await StaffDirectory.find({ isActive: true })
        .sort({ lastProcessedAt: 1 })
        .select('baseUrl staffDirectory successfulParser parserFailedLastTime lastProcessedAt')
        .lean();

      console.log(`📋 Found ${this.directories.length} directories to process from database`);

      // Get current month and year for comparison
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth(); // 0-indexed (0=Jan, 11=Dec)

      // Filter out directories that were already processed this month
      const directoriesToProcess = this.directories.filter(directory => {
        if (!directory.lastProcessedAt) {
          // Never processed before - include it
          return true;
        }

        const lastProcessed = new Date(directory.lastProcessedAt);
        const lastYear = lastProcessed.getFullYear();
        const lastMonth = lastProcessed.getMonth();

        // Check if it was processed in the current month
        const wasProcessedThisMonth = (lastYear === currentYear && lastMonth === currentMonth);

        return !wasProcessedThisMonth;
      });

      console.log(`🔄 Filtered to ${directoriesToProcess.length} directories to process (skipping ${this.directories.length - directoriesToProcess.length} already processed this month)`);
      console.log(`🎯 Resuming from index: ${this.lastProcessedIndex}`);

      let delay = 600;

      for (let i = this.lastProcessedIndex; i < directoriesToProcess.length; i++) {
        // Check for stop signal at the beginning of each iteration
        if (this.shouldStop) {
          console.log(`🛑 Scraping stopped by user request at index ${i}`);
          console.log(`📊 Progress: ${i}/${directoriesToProcess.length} sites processed`);
          break;
        }

        const directory = directoriesToProcess[i];
        const { baseUrl, staffDirectory, successfulParser, parserFailedLastTime } = directory;

        console.log(`\n🔍 Processing ${i + 1}/${directoriesToProcess.length}: ${baseUrl}`);

        // If parser failed last time, don't use it
        const parserToUse = parserFailedLastTime ? null : successfulParser;

        if (parserToUse) {
          console.log(`🎯 Using known parser: ${parserToUse}`);
        } else if (successfulParser && parserFailedLastTime) {
          console.log(`🔄 Known parser ${successfulParser} failed last time, trying all parsers...`);
        }

        try {
          const result = await processStaffDirectory(baseUrl, staffDirectory, parserToUse);

          if (result.success) {
            this.successCount++;
            console.log(`✅ Successfully processed: ${baseUrl} (${result.staffCount} staff)`);

            // Update the directory with parser info and reset failure flag
            await StaffDirectory.findOneAndUpdate(
              { staffDirectory },
              {
                successfulParser: result.usedParser,
                parserFailedLastTime: false, // Reset failure flag
                lastProcessedAt: new Date(),
                lastStaffCount: result.staffCount,
                $inc: { processCount: 1 }
              }
            );

            if (result.usedParser && result.usedParser !== parserToUse) {
              console.log(`💾 Saved new parser ${result.usedParser} for future use`);
            }
          } else {
            this.errorCount++;
            console.log(`❌ No data extracted from: ${baseUrl}`);

            // If we were using a known parser and it failed, mark it as failed
            if (parserToUse) {
              await StaffDirectory.findOneAndUpdate(
                { staffDirectory },
                {
                  parserFailedLastTime: true,
                  lastProcessedAt: new Date(),
                  $inc: { processCount: 1 }
                }
              );
              console.log(`⚠️ Marked parser ${parserToUse} as failed for this site`);
            } else {
              await StaffDirectory.findOneAndUpdate(
                { staffDirectory },
                {
                  lastProcessedAt: new Date(),
                  $inc: { processCount: 1 }
                }
              );
            }
          }

          this.lastProcessedIndex = i + 1;

        } catch (error) {
          this.errorCount++;
          console.error(`❌ Failed to process ${baseUrl}:`, error.message);

          // Mark parser as failed if we were using a known one
          if (parserToUse) {
            await StaffDirectory.findOneAndUpdate(
              { staffDirectory },
              {
                parserFailedLastTime: true,
                lastProcessedAt: new Date(),
                $inc: { processCount: 1 }
              }
            );
          } else {
            await StaffDirectory.findOneAndUpdate(
              { staffDirectory },
              {
                lastProcessedAt: new Date(),
                $inc: { processCount: 1 }
              }
            );
          }
        }

        // Check for stop signal again before waiting
        if (this.shouldStop) {
          console.log(`🛑 Scraping stopped during wait period`);
          break;
        }

        if (i < directoriesToProcess.length - 1 && !this.shouldStop) {
          console.log(`⏳ Waiting ${delay / 1000} seconds before next directory...`);
          await this.delay(delay);
        }
      }

      if (!this.shouldStop) {
        console.log(`\n🎉 Scraping cycle completed!`);
        console.log(`📊 Results: ${this.successCount} successful, ${this.errorCount} failed`);
        this.lastProcessedIndex = 0;
      } else {
        console.log(`\n⏹️ Scraping stopped.`);
        console.log(`📊 Partial results: ${this.successCount} successful, ${this.errorCount} failed`);
        console.log(`🔄 Next run will resume from index: ${this.lastProcessedIndex}`);
      }

    } catch (error) {
      console.error('❌ Error in scraping cycle:', error);
    } finally {
      // CRITICAL: Reset the running state when done
      this.isRunning = false;
      this.shouldStop = false;
      
      // Close browser if no active requests
      setTimeout(() => {
        if (puppeteerManager.activeRequests === 0) {
          puppeteerManager.closeBrowser().catch(console.error);
        }
      }, 5000); // Wait 5 seconds before closing
      console.log('🏁 Scraping cycle fully stopped');
    }
  }
  // Import directories from uploaded file
  async importDirectories(urls) {
    try {
      let importedCount = 0;
      let skippedCount = 0;

      for (const urlObj of urls) {
        try {
          const result = await StaffDirectory.findOneAndUpdate(
            { staffDirectory: urlObj.staffDirectory },
            {
              $setOnInsert: {
                baseUrl: urlObj.baseUrl,
                staffDirectory: urlObj.staffDirectory,
                isActive: true
              }
            },
            {
              upsert: true,
              new: true,
              runValidators: true
            }
          );

          if (result.isNew) {
            importedCount++;
          } else {
            skippedCount++;
          }
        } catch (error) {
          console.error(`❌ Error importing ${urlObj.staffDirectory}:`, error.message);
          skippedCount++;
        }
      }

      return {
        success: true,
        importedCount,
        skippedCount,
        message: `Imported ${importedCount} new directories, ${skippedCount} already existed or failed`
      };
    } catch (error) {
      console.error('❌ Error importing directories:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  stopScraping() {
    if (this.isRunning && !this.shouldStop) {
      this.shouldStop = true;
      console.log('🛑 Stop signal sent to scraping process...');

      // Also stop the current process if it's stuck
      if (this.currentProcess) {
        console.log('⏹️ Force stopping current process...');
        // You might need to handle process cancellation here
      }

      return {
        success: true,
        message: 'Scraping stop signal sent. It may take a moment to fully stop.',
        currentProgress: this.getProgress()
      };
    } else if (this.isRunning && this.shouldStop) {
      return {
        success: false,
        message: 'Scraping is already being stopped. Please wait.',
        currentProgress: this.getProgress()
      };
    } else {
      return {
        success: false,
        message: 'No scraping process is currently running',
        currentProgress: this.getProgress()
      };
    }
  }

    async triggerManualScraping() {
    console.log('🔧 Manual scraping triggered - waiting for current process');
    
    // Wait for current cycle to complete if running
    if (this.isRunning) {
      console.log('⏳ Waiting for current scraping cycle to complete...');
      await this.waitForCycleToComplete();
    }
    
    console.log('✅ Starting manual scraping');
    await this.runScrapingCycle();
  }

   waitForCycleToComplete() {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (!this.isRunning) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 1000);
    });
  }



  // Get progress information
  getProgress() {
    const total = this.directories.length;
    const current = this.lastProcessedIndex;
    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

    return {
      currentIndex: current,
      totalDirectories: total,
      progressPercentage: percentage,
      successCount: this.successCount,
      errorCount: this.errorCount,
      status: this.isRunning ?
        (this.shouldStop ? 'stopping' : 'running') :
        (current > 0 && current < total ? 'paused' : 'idle')
    };
  }

  // Reset progress to start from beginning
  resetProgress() {
    this.lastProcessedIndex = 0;
    this.successCount = 0;
    this.errorCount = 0;
    console.log('🔄 Progress reset to beginning');
    return {
      success: true,
      message: 'Progress reset to beginning',
      progress: this.getProgress()
    };
  }

  // Jump to specific index (for testing/debugging)
  setProgressIndex(index) {
    if (index >= 0 && index <= this.directories.length) {
      this.lastProcessedIndex = index;
      console.log(`🔄 Progress set to index: ${index}`);
      return {
        success: true,
        message: `Progress set to index ${index}`,
        progress: this.getProgress()
      };
    } else {
      return {
        success: false,
        message: `Invalid index. Must be between 0 and ${this.directories.length}`
      };
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  stop() {
    if (this.currentJob) {
      this.currentJob.stop();
      console.log('⏹️ Scraping scheduler stopped');
    }
  }

  // Add this method to your SchedulerService class
async scrapeFailedDirectories(failedDirs) {
    console.log(`🔧 Starting to process ${failedDirs.length} failed directories`);
    
    this.isRunning = true;
    this.shouldStop = false;
    this.successCount = 0;
    this.errorCount = 0;
    this.directories = []; // Reset for failed directory processing
    this.lastProcessedIndex = 0;
    
    // Track that we're processing failed directories specifically
    this.isProcessingFailed = true;
    this.failedDirectoriesList = failedDirs;
    
    try {
        let processedCount = 0;
        let succeeded = 0;
        let failed = 0;
        
        for (let i = 0; i < failedDirs.length; i++) {
            // Check for stop signal
            if (this.shouldStop) {
                console.log(`🛑 Failed directory scraping stopped at index ${i}`);
                break;
            }
            
            const failedDir = failedDirs[i];
            const { baseUrl, staffDirectory, _id } = failedDir;
            
            console.log(`\n🔄 Processing failed directory ${i + 1}/${failedDirs.length}: ${baseUrl}`);
            
            try {
                // Remove from failed directories before retrying
                await FailedDirectory.findByIdAndDelete(_id);
                console.log(`🗑️ Removed ${baseUrl} from failed list`);
                
                // Try to find existing StaffDirectory entry for parser history
                const staffDirEntry = await StaffDirectory.findOne({ 
                    staffDirectory: staffDirectory 
                });
                
                const parserToUse = staffDirEntry?.successfulParser && 
                                  !staffDirEntry?.parserFailedLastTime ? 
                                  staffDirEntry.successfulParser : null;
                
                if (parserToUse) {
                    console.log(`🎯 Using known parser: ${parserToUse}`);
                }
                
                // Scrape the directory
                const result = await processStaffDirectory(
                    baseUrl, 
                    staffDirectory, 
                    parserToUse
                );
                
                if (result.success) {
                    succeeded++;
                    console.log(`✅ Successfully scraped ${baseUrl} (${result.staffCount} staff)`);
                    
                    // Update or create StaffDirectory entry
                    await StaffDirectory.findOneAndUpdate(
                        { staffDirectory: staffDirectory },
                        {
                            baseUrl: baseUrl,
                            staffDirectory: staffDirectory,
                            successfulParser: result.usedParser || parserToUse,
                            parserFailedLastTime: false,
                            lastProcessedAt: new Date(),
                            lastStaffCount: result.staffCount,
                            isActive: true,
                            $inc: { processCount: 1 }
                        },
                        { upsert: true, new: true }
                    );
                    
                } else {
                    failed++;
                    console.log(`❌ Failed to scrape ${baseUrl}`);
                    
                    // Add back to failed directories
                    await FailedDirectory.findOneAndUpdate(
                        { staffDirectory: staffDirectory },
                        {
                            baseUrl: baseUrl,
                            staffDirectory: staffDirectory,
                            failureType: 'no_data',
                            errorMessage: 'Bulk retry failed: No data extracted',
                            lastAttempt: new Date(),
                            $inc: { attemptCount: 1 }
                        },
                        { upsert: true, new: true }
                    );
                    
                    // Update parser failure status
                    if (staffDirEntry) {
                        await StaffDirectory.findByIdAndUpdate(
                            staffDirEntry._id,
                            {
                                parserFailedLastTime: true,
                                lastProcessedAt: new Date(),
                                $inc: { processCount: 1 }
                            }
                        );
                    }
                }
                
                processedCount++;
                
            } catch (error) {
                failed++;
                console.error(`❌ Error processing ${baseUrl}:`, error.message);
                
                // Add back to failed directories
                try {
                    await FailedDirectory.findOneAndUpdate(
                        { staffDirectory: staffDirectory },
                        {
                            baseUrl: baseUrl,
                            staffDirectory: staffDirectory,
                            failureType: 'fetch_failed',
                            errorMessage: `Bulk retry error: ${error.message.substring(0, 200)}`,
                            lastAttempt: new Date(),
                            $inc: { attemptCount: 1 }
                        },
                        { upsert: true, new: true }
                    );
                } catch (dbError) {
                    console.error('Error updating failed directory:', dbError);
                }
            }
            
            // Add delay between requests (shorter delay for failed directories)
            if (i < failedDirs.length - 1 && !this.shouldStop) {
                const delay = 3000; // 3 seconds between failed directory attempts
                console.log(`⏳ Waiting ${delay/1000} seconds before next failed directory...`);
                await this.delay(delay);
            }
            
            this.lastProcessedIndex = i + 1;
        }
        
        console.log(`\n📊 Failed directory processing complete!`);
        console.log(`✅ Succeeded: ${succeeded}`);
        console.log(`❌ Failed: ${failed}`);
        console.log(`📈 Processed: ${processedCount}/${failedDirs.length}`);
        
        return {
            total: failedDirs.length,
            processed: processedCount,
            succeeded: succeeded,
            failed: failed,
            isComplete: processedCount === failedDirs.length
        };
        
    } catch (error) {
        console.error('❌ Error in failed directory processing:', error);
        throw error;
    } finally {
        this.isRunning = false;
        this.shouldStop = false;
        this.isProcessingFailed = false;
        this.failedDirectoriesList = null;
        
        // Close browser after a delay
        setTimeout(() => {
            if (puppeteerManager.activeRequests === 0) {
                puppeteerManager.closeBrowser().catch(console.error);
            }
        }, 5000);
        
        console.log('🏁 Failed directory processing fully stopped');
    }
}

// Add this method to get status specific to failed directory processing
getFailedDirStatus() {
    return {
        isProcessingFailed: this.isProcessingFailed || false,
        failedDirProgress: this.failedDirectoriesList ? {
            current: this.lastProcessedIndex,
            total: this.failedDirectoriesList.length,
            percentage: this.failedDirectoriesList.length > 0 ? 
                Math.round((this.lastProcessedIndex / this.failedDirectoriesList.length) * 100) : 0
        } : null
    };
}

// Update the existing getStatus method to include failed directory info
getStatus() {
    const progress = this.getProgress();
    const failedDirStatus = this.getFailedDirStatus();
    
    return {
        isRunning: this.isRunning,
        shouldStop: this.shouldStop,
        progress: progress,
        failedDirStatus: failedDirStatus,
        nextScheduled: "1st of every month at 2:00 AM"
    };
}
}

export default new SchedulerService();