// services/schedulerService.js
import cron from 'node-cron';
import fs from 'fs';
import processStaffDirectory from "../utils/processStaffDirectory.js";
import StaffDirectory from '../models/StaffDirectory.js';
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
            .select('baseUrl staffDirectory successfulParser parserFailedLastTime')
            .lean();

        console.log(`📋 Found ${this.directories.length} directories to process from database`);
        console.log(`🔄 Resuming from index: ${this.lastProcessedIndex}`);

        let delay = 600;
        
        for (let i = this.lastProcessedIndex; i < this.directories.length; i++) {
            // Check for stop signal at the beginning of each iteration
            if (this.shouldStop) {
                console.log(`🛑 Scraping stopped by user request at index ${i}`);
                console.log(`📊 Progress: ${i}/${this.directories.length} sites processed`);
                break;
            }

            const directory = this.directories[i];
            const { baseUrl, staffDirectory, successfulParser, parserFailedLastTime } = directory;

            console.log(`\n🔍 Processing ${i + 1}/${this.directories.length}: ${baseUrl}`);
            
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

            if (i < this.directories.length - 1 && !this.shouldStop) {
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
  // Manual trigger for testing
  async triggerManualScraping() {
    console.log('🔧 Manual scraping triggered');
    await this.runScrapingCycle();
  }

  // Get current status with progress
  getStatus() {
    const progress = this.getProgress();
    return {
      isRunning: this.isRunning,
      shouldStop: this.shouldStop,
      progress: progress,
      nextScheduled: "1st of every month at 2:00 AM"
    };
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
}

export default new SchedulerService();