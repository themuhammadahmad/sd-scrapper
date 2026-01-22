// services/schedulerService.js
import cron from 'node-cron';
import processStaffDirectory from "../utils/processStaffDirectory.js";
import puppeteerManager from '../fallback/puppeteerParser.js';
import StaffDirectory from '../models/StaffDirectory.js';
import FailedDirectory from '../models/FailedDirectory.js';
import { ExportScheduler } from './export/ExportScheduler.js';

class SchedulerService {
  constructor() {
    this.isRunning = false;
    this.currentJob = null;
    this.shouldStop = false;
    this.successCount = 0;
    this.errorCount = 0;
    this.isProcessingFailed = false;
    this.failedDirectoriesList = null;
    this.currentlyProcessingUrl = null; // Track current URL for crash recovery

    // Export scheduler instance
    this.exportScheduler = null;
    this.exportInProgress = false;

    this.monthlyScheduled = false; // Track if monthly scheduling is already set up
  }

  startMonthlyScraping() {
    if (this.monthlyScheduled) {
      console.log('📅 Monthly scraping already scheduled');
      return;
    }

    // Run on the 1st day of every month at 2:00 AM
    this.currentJob = cron.schedule('0 2 1 * *', async () => {
      console.log('🚀 Starting monthly automated scraping cycle...');
      await this.runScrapingCycle();
    }, {
      scheduled: true,
      timezone: "America/New_York"
    });

    this.monthlyScheduled = true;
    console.log('✅ Monthly scraping scheduler started (will run on 1st of every month at 2:00 AM)');
  }

  initializeMonthlyScheduling() {
    if (!this.monthlyScheduled) {
      this.startMonthlyScraping();
    } else {
      console.log('📅 Monthly scheduling already initialized');
    }
  }

  async runScrapingCycle() {
    // IMPORTANT: Check if already running at the very beginning
    if (this.isRunning) {
      console.log('⚠️ Scraping cycle already running, skipping...');
      return Promise.resolve();
    }

    this.isRunning = true;
    this.shouldStop = false;
    this.successCount = 0;
    this.errorCount = 0;
    this.currentlyProcessingUrl = null;

    try {
      // Fetch active directories from database
      const directories = await StaffDirectory.find({ isActive: true })
        .sort({ lastProcessedAt: 1 })
        .select('baseUrl staffDirectory successfulParser parserFailedLastTime lastProcessedAt')
        .lean();

      console.log(`📋 Found ${directories.length} directories to process from database`);

      // Get current month and year for comparison
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();

      // Filter out directories that were already processed this month
      const directoriesToProcess = directories.filter(directory => {
        if (!directory.lastProcessedAt) {
          return true;
        }

        const lastProcessed = new Date(directory.lastProcessedAt);
        const lastYear = lastProcessed.getFullYear();
        const lastMonth = lastProcessed.getMonth();

        const wasProcessedThisMonth = (lastYear === currentYear && lastMonth === currentMonth);
        return !wasProcessedThisMonth;
      });

      console.log(`🔄 Filtered to ${directoriesToProcess.length} directories to process (skipping ${directories.length - directoriesToProcess.length} already processed this month)`);

      let delay = 600;

      for (let i = 0; i < directoriesToProcess.length; i++) {
        if (this.shouldStop) {
          console.log(`🛑 Scraping stopped by user request at index ${i}`);
          console.log(`📊 Progress: ${i}/${directoriesToProcess.length} sites processed`);
          break;
        }

        const directory = directoriesToProcess[i];
        const { baseUrl, staffDirectory, successfulParser, parserFailedLastTime } = directory;
        
        // Track current URL for crash recovery visibility
        this.currentlyProcessingUrl = baseUrl;

        console.log(`\n🔍 Processing ${i + 1}/${directoriesToProcess.length}: ${baseUrl}`);
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

            await StaffDirectory.findOneAndUpdate(
              { staffDirectory },
              {
                successfulParser: result.usedParser,
                parserFailedLastTime: false,
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

        } catch (error) {
          this.errorCount++;
          console.error(`❌ Failed to process ${baseUrl}:`, error.message);

          // Log error but continue to next directory
          await FailedDirectory.findOneAndUpdate(
            { staffDirectory: directory.staffDirectory },
            {
              baseUrl: directory.baseUrl,
              staffDirectory: directory.staffDirectory,
              failureType: 'critical_error',
              errorMessage: `Caught error: ${error.message.substring(0, 200)}`,
              lastAttempt: new Date(),
              $inc: { attemptCount: 1 }
            },
            { upsert: true }
          );
        }

        // Clear current URL after processing (success or failure)
        this.currentlyProcessingUrl = null;

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

        // ✅ Run export after successful scraping completion
        if (this.successCount > 0) {
          await this.runExportIfNotInProgress();
        } else {
          console.log('⚠️ No successful scrapes, skipping export');
        }
      } else {
        console.log(`\n⏹️ Scraping stopped.`);
        console.log(`📊 Partial results: ${this.successCount} successful, ${this.errorCount} failed`);
      }

    } catch (error) {
      console.error('❌ Fatal error in scraping cycle:', error);
      // Clear current URL on fatal error
      this.currentlyProcessingUrl = null;
      throw error;
      
    } finally {
      this.isRunning = false;
      this.shouldStop = false;
      this.currentlyProcessingUrl = null;

      setTimeout(() => {
        if (puppeteerManager.activeRequests === 0) {
          puppeteerManager.closeBrowser().catch(console.error);
        }
      }, 5000);
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
    console.log('🔧 Manual scraping triggered');
    
    if (this.isRunning) {
      console.log('⏳ Already running, skipping...');
      return;
    }

    await this.runScrapingCycle();
  }

  getSchedulingStatus() {
    return {
      monthlyScheduled: this.monthlyScheduled,
      nextRun: this.monthlyScheduled ? "1st of every month at 2:00 AM" : "Not scheduled",
      currentJobActive: this.currentJob ? this.currentJob.getStatus() === 'started' : false
    };
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
    return {
      isRunning: this.isRunning,
      shouldStop: this.shouldStop,
      successCount: this.successCount,
      errorCount: this.errorCount,
      currentlyProcessingUrl: this.currentlyProcessingUrl,
      status: this.isRunning ? (this.shouldStop ? 'stopping' : 'running') : 'idle'
    };
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

  async runExportIfNotInProgress() {
    if (!this.exportScheduler) {
      console.log('⚠️ Export scheduler not available, skipping export');
      return null;
    }

    if (this.exportInProgress) {
      console.log('⏳ Export already in progress, skipping duplicate call');
      return null;
    }

    try {
      this.exportInProgress = true;
      console.log('📤 Starting export after scraping completion...');

      const exportResult = await this.exportScheduler.runFullExport();

      console.log('✅ Export completed successfully');
      return exportResult;
    } catch (error) {
      console.error('❌ Export failed after scraping:', error.message);
      return { error: error.message };
    } finally {
      this.exportInProgress = false;
    }
  }

  async scrapeFailedDirectories(failedDirs) {
    console.log(`🔧 Starting to process ${failedDirs.length} failed directories`);

    this.isRunning = true;
    this.shouldStop = false;
    this.successCount = 0;
    this.errorCount = 0;
    this.isProcessingFailed = true;
    this.failedDirectoriesList = failedDirs;

    try {
      let processedCount = 0;
      let succeeded = 0;
      let failed = 0;

      for (let i = 0; i < failedDirs.length; i++) {
        if (this.shouldStop) {
          console.log(`🛑 Failed directory scraping stopped at index ${i}`);
          break;
        }

        const failedDir = failedDirs[i];
        const { baseUrl, staffDirectory, _id } = failedDir;

        console.log(`\n🔄 Processing failed directory ${i + 1}/${failedDirs.length}: ${baseUrl}`);

        try {
          await FailedDirectory.findByIdAndDelete(_id);
          console.log(`🗑️ Removed ${baseUrl} from failed list`);

          const staffDirEntry = await StaffDirectory.findOne({
            staffDirectory: staffDirectory
          });

          const parserToUse = staffDirEntry?.successfulParser &&
            !staffDirEntry?.parserFailedLastTime ?
            staffDirEntry.successfulParser : null;

          if (parserToUse) {
            console.log(`🎯 Using known parser: ${parserToUse}`);
          }

          const result = await processStaffDirectory(
            baseUrl,
            staffDirectory,
            parserToUse
          );

          if (result.success) {
            succeeded++;
            this.successCount++;
            console.log(`✅ Successfully scraped ${baseUrl} (${result.staffCount} staff)`);

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
            this.errorCount++;
            console.log(`❌ Failed to scrape ${baseUrl}`);

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
          this.errorCount++;
          console.error(`❌ Error processing ${baseUrl}:`, error.message);

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

        if (i < failedDirs.length - 1 && !this.shouldStop) {
          const delay = 3000;
          console.log(`⏳ Waiting ${delay / 1000} seconds before next failed directory...`);
          await this.delay(delay);
        }
      }

      console.log(`\n📊 Failed directory processing complete!`);
      console.log(`✅ Succeeded: ${succeeded}`);
      console.log(`❌ Failed: ${failed}`);
      console.log(`📈 Processed: ${processedCount}/${failedDirs.length}`);

      // ✅ Run export after failed directories processing if any succeeded
      if (succeeded > 0) {
        await this.runExportIfNotInProgress();
      } else {
        console.log('⚠️ No successful scrapes in failed directory processing, skipping export');
      }

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

      setTimeout(() => {
        if (puppeteerManager.activeRequests === 0) {
          puppeteerManager.closeBrowser().catch(console.error);
        }
      }, 5000);

      console.log('🏁 Failed directory processing fully stopped');
    }
  }

  // Set export scheduler after initialization
  setExportScheduler(exportScheduler) {
    this.exportScheduler = exportScheduler;
    console.log('✅ Export scheduler linked to scraping service');
  }

  getFailedDirStatus() {
    return {
      isProcessingFailed: this.isProcessingFailed || false,
      failedDirProgress: this.failedDirectoriesList ? {
        current: this.successCount + this.errorCount,
        total: this.failedDirectoriesList.length,
        percentage: this.failedDirectoriesList.length > 0 ?
          Math.round(((this.successCount + this.errorCount) / this.failedDirectoriesList.length) * 100) : 0
      } : null
    };
  }

  getStatus() {
    const progress = this.getProgress();
    const failedDirStatus = this.getFailedDirStatus();

    return {
      isRunning: this.isRunning,
      shouldStop: this.shouldStop,
      progress: progress,
      failedDirStatus: failedDirStatus,
      nextScheduled: "1st of every month at 2:00 AM",
      exportInProgress: this.exportInProgress || false
    };
  }
}

export default new SchedulerService();