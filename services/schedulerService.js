// services/schedulerService.js
import cron from 'node-cron';
import fs from 'fs';
import processStaffDirectory from "../utils/processStaffDirectory.js";

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
    this.lastProcessedIndex = 0; // Track last processed index
    this.directories = []; // Store directories in memory
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
    if (this.isRunning) {
      console.log('⚠️ Scraping cycle already running, skipping...');
      return;
    }

    this.isRunning = true;
    this.shouldStop = false;
    this.successCount = 0;
    this.errorCount = 0;
     
    try {
           const filePath = path.join(__dirname, '..', 'public', 'data', 'ncca', 'staff0-directories.json');
      this.directories = JSON.parse(fs.readFileSync(filePath, "utf-8"));

      console.log(`📋 Found ${this.directories.length} directories to process`);
      console.log(`🔄 Resuming from index: ${this.lastProcessedIndex}`);

      let delay = 600;
      
      // Process each directory starting from last processed index
      for (let i = this.lastProcessedIndex; i < this.directories.length; i++) {
        // Check if stop was requested
        if (this.shouldStop) {
          console.log(`🛑 Scraping stopped by user request at index ${i}`);
          console.log(`📊 Progress: ${i}/${this.directories.length} sites processed`);
          break;
        }

        const { baseUrl, staffDirectory } = this.directories[i];

        console.log(`\n🔍 Processing ${i + 1}/${this.directories.length}: ${baseUrl}`);

        try {
          const result = await processStaffDirectory(baseUrl, staffDirectory);

          if (result.success) {
            this.successCount++;
            console.log(`✅ Successfully processed: ${baseUrl} (${result.staffCount} staff)`);
          } else {
            this.errorCount++;
            console.log(`❌ No data extracted from: ${baseUrl}`);
          }
          
          // Update last processed index ONLY after successful attempt
          this.lastProcessedIndex = i + 1;
          
        } catch (error) {
          this.errorCount++;
          console.error(`❌ Failed to process ${baseUrl}:`, error.message);
          // Don't update index on error - retry next time
        }

        // Wait before processing next directory (unless stopped or last one)
        if (i < this.directories.length - 1 && !this.shouldStop) {
          console.log(`⏳ Waiting ${delay / 1000} seconds before next directory...`);
          await this.delay(delay);
        }
      }

      if (!this.shouldStop) {
        console.log(`\n🎉 Scraping cycle completed!`);
        console.log(`📊 Results: ${this.successCount} successful, ${this.errorCount} failed`);
        this.lastProcessedIndex = 0; // Reset when fully completed
      } else {
        console.log(`\n⏹️ Scraping stopped.`);
        console.log(`📊 Partial results: ${this.successCount} successful, ${this.errorCount} failed`);
        console.log(`🔄 Next run will resume from index: ${this.lastProcessedIndex}`);
      }

    } catch (error) {
      console.error('❌ Error in scraping cycle:', error);
    } finally {
      this.isRunning = false;
      this.shouldStop = false;
    }
  }

  // Add this method to stop scraping
  stopScraping() {
    if (this.isRunning) {
      this.shouldStop = true;
      console.log('🛑 Stop signal sent to scraping process...');
      return { 
        success: true, 
        message: 'Scraping stop signal sent',
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