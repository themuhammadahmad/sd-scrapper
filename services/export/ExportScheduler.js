// services/export/ExportScheduler.js
import cron from 'node-cron';
import { ExportManager } from './ExportManager.js';

export class ExportScheduler {
  constructor() {
    this.exportManager = new ExportManager();
    this.isRunning = false;
  }

  /**
   * Initialize scheduled jobs
   */
  initialize() {
    console.log('📅 Initializing export scheduler...');
    
    // Run every 2 hours
    cron.schedule('0 */2 * * *', async () => {
      console.log('⏰ Scheduled full export triggered (every 2 hours)');
      await this.runFullExport();
    });

    // Run cleanup every day at 3 AM
    cron.schedule('0 3 * * *', async () => {
      console.log('🧹 Scheduled cleanup triggered (daily at 3 AM)');
      await this.runCleanup();
    });

    console.log('✅ Scheduler initialized');
    console.log('📊 Full export: Every 2 hours');
    console.log('🗑️  Cleanup: Daily at 3 AM');
    
    // Trigger first export immediately when server starts
    setTimeout(async () => {
      console.log('🚀 Triggering initial export on server start...');
      // await this.runFullExport();
    }, 10000); // Wait 10 seconds after server starts
  }

// services/export/ExportScheduler.js

async runFullExport() {
  if (this.isRunning) {
    console.log('⚠️ Export job already running, skipping...');
    return null; // Return null instead of just returning
  }

  this.isRunning = true;
  const startTime = Date.now();

  try {
    console.log('🔄 Starting full export...');
    
    const result = await this.exportManager.generateFullExport();
    
    const duration = Date.now() - startTime;
    console.log(`✅ Export completed in ${duration}ms: ${result.filename} (${result.recordCount} records)`);
    
    return result;
    
  } catch (error) {
    console.error('❌ Export failed:', error.message);
    // Don't throw - just log the error to prevent scheduler crash
    return { error: error.message };
    
  } finally {
    this.isRunning = false;
  }
}

  /**
   * Run cleanup job
   */
  async runCleanup() {
    try {
      console.log('🧹 Running cleanup...');
      
      const result = await this.exportManager.cleanupOldExports();
      
      console.log(`✅ Cleanup completed: ${result.deletedCount} files deleted`);
      return result;
      
    } catch (error) {
      console.error('❌ Cleanup failed:', error.message);
      return null;
    }
  }

  /**
   * Manual trigger for full export
   */
  async triggerManualExport() {
    console.log('👤 Manual export triggered by user');
    return this.runFullExport();
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      nextExport: this.getNextScheduledTime('0 */2 * * *'),
      nextCleanup: this.getNextScheduledTime('0 3 * * *'),
      uptime: process.uptime()
    };
  }

  /**
   * Calculate next scheduled time
   */
  getNextScheduledTime(cronExpression) {
    try {
      const schedule = cron.parse(cronExpression);
      const nextDate = schedule.next();
      return nextDate.toISOString();
    } catch (error) {
      return 'Unknown';
    }
  }
}