// services/schedulerService.js
import cron from 'node-cron';
import fs from 'fs';
import processStaffDirectory from "../utils/processStaffDirectory.js";
import path from 'path';

class SchedulerService {
  constructor() {
    this.isRunning = false;
    this.currentJob = null;
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
     
    try {
      const filePath = path.join(process.cwd(), 'public', 'data', 'ncca', 'staff0-directories.json');
      const directories = JSON.parse(
        fs.readFileSync(filePath, "utf-8")
      );

      console.log(`📋 Found ${directories.length} directories to process`);

      let successCount = 0;
      let errorCount = 0;

      // Process each directory with a 30-second delay between them
      let end = directories.length;
      let start = 0;
      end = 1;
      let delay = 1000;
      for (let i = start; i < end; i++) {
        const { baseUrl, staffDirectory } = directories[i];

        console.log(`\n🔍 Processing ${i + 1}/${directories.length}: ${baseUrl}`);

        try {
          const result = await processStaffDirectory(baseUrl, staffDirectory);

          if (result.success) {
            successCount++;
            console.log(`✅ Successfully processed: ${baseUrl} (${result.staffCount} staff)`);
          } else {
            errorCount++;
            console.log(`❌ No data extracted from: ${baseUrl}`);
          }
        } catch (error) {
          errorCount++;
          console.error(`❌ Failed to process ${baseUrl}:`, error.message);
        }

        // Wait 30 seconds before processing next directory (unless it's the last one)
        if (i < directories.length - 1) {
          console.log(`⏳ Waiting ${delay / 1000} seconds before next directory...`);
          await this.delay(delay);
        }
      }

      console.log(`\n🎉 Monthly scraping cycle completed!`);
      console.log(`📊 Results: ${successCount} successful, ${errorCount} failed`);

    } catch (error) {
      console.error('❌ Error in scraping cycle:', error);
    } finally {
      this.isRunning = false;
    }
  }

  // Manual trigger for testing
  async triggerManualScraping() {
    console.log('🔧 Manual scraping triggered');
    await this.runScrapingCycle();
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


