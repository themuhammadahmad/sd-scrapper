// services/export/ExportManager.js
import ExportFile from '../../models/ExportFile.js';
import { ExcelExportService } from './ExcelExportService.js';
import fs from 'fs-extra';
import path from 'path';

export class ExportManager {
  constructor() {
    this.excelService = new ExcelExportService();
  }

// services/export/ExportManager.js

async generateFullExport() {
  try {
    console.log('🚀 Starting full export generation...');
    
    const fileInfo = await this.excelService.generateFullExport();
    
    // Check if file with same name already exists in database
    const existingFile = await ExportFile.findOne({ filename: fileInfo.filename });
    if (existingFile) {
      console.log(`⚠️ File ${fileInfo.filename} already exists in database, skipping save`);
      return {
        success: true,
        fileId: existingFile._id,
        filename: fileInfo.filename,
        recordCount: fileInfo.recordCount,
        fileSize: this.formatFileSize(fileInfo.fileSize),
        downloadUrl: `/api/exports/download/${existingFile._id}`,
        alreadyExists: true
      };
    }
    
    // Create database record
    const exportFile = new ExportFile({
      filename: fileInfo.filename,
      filePath: fileInfo.filePath,
      fileType: 'full',
      universityName: 'All Universities',
      recordCount: fileInfo.recordCount,
      fileSize: fileInfo.fileSize,
      generatedAt: fileInfo.generatedAt,
      metadata: {
        columns: [
          'IPEDS/NCES ID', 'School', 'Unique ID', 'Sport code',
          'First name', 'Last name', 'Position', 'Email address', 
          'Phone number', 'Last Updated:'
        ]
      }
    });

    await exportFile.save();
    
    // Deactivate old full exports (keep only latest active)
    await ExportFile.updateMany(
      { 
        fileType: 'full',
        _id: { $ne: exportFile._id },
        isActive: true 
      },
      { isActive: false }
    );

    console.log(`✅ Full export saved to database: ${fileInfo.filename}`);
    
    return {
      success: true,
      fileId: exportFile._id,
      filename: fileInfo.filename,
      recordCount: fileInfo.recordCount,
      fileSize: this.formatFileSize(fileInfo.fileSize),
      downloadUrl: `/api/exports/download/${exportFile._id}`
    };

  } catch (error) {
    // Handle duplicate key error specifically
    if (error.code === 11000 || error.message.includes('duplicate key')) {
      console.log(`⚠️ File already exists, skipping database save`);
      
      // Try to get the existing file
      const existingFile = await ExportFile.findOne({ filename: error.keyValue?.filename });
      if (existingFile) {
        return {
          success: true,
          fileId: existingFile._id,
          filename: existingFile.filename,
          recordCount: existingFile.recordCount,
          fileSize: this.formatFileSize(existingFile.fileSize),
          downloadUrl: `/api/exports/download/${existingFile._id}`,
          alreadyExists: true
        };
      }
    }
    
    console.error('❌ Failed to generate full export:', error);
    throw error;
  }
}

  /**
   * Generate export for specific university
   */
  async generateUniversityExport(siteId) {
    try {
      console.log(`🎓 Generating university export for site: ${siteId}`);
      
      const fileInfo = await this.excelService.generateUniversityExport(siteId);
      
      // Create database record
      const exportFile = new ExportFile({
        filename: fileInfo.filename,
        filePath: fileInfo.filePath,
        fileType: 'university',
        universityId: fileInfo.universityId,
        universityName: fileInfo.universityName,
        recordCount: fileInfo.recordCount,
        fileSize: fileInfo.fileSize,
        generatedAt: fileInfo.generatedAt,
        metadata: {
          columns: [
            'IPEDS/NCES ID', 'School', 'Unique ID', 'Sport code',
            'First name', 'Last name', 'Position', 'Email address', 
            'Phone number', 'Last Updated:'
          ]
        }
      });

      await exportFile.save();
      
      console.log(`✅ University export saved: ${fileInfo.filename}`);
      
      return {
        success: true,
        fileId: exportFile._id,
        filename: fileInfo.filename,
        universityName: fileInfo.universityName,
        recordCount: fileInfo.recordCount,
        fileSize: this.formatFileSize(fileInfo.fileSize),
        downloadUrl: `/api/exports/download/${exportFile._id}`
      };

    } catch (error) {
      console.error(`❌ Failed to generate university export for ${siteId}:`, error);
      throw error;
    }
  }

  /**
   * Get active export files
   */
  async getActiveExports() {
    try {
      const exports = await ExportFile.find({ isActive: true })
        .sort({ generatedAt: -1 })
        .lean();

      return exports.map(exp => ({
        id: exp._id,
        filename: exp.filename,
        fileType: exp.fileType,
        universityName: exp.universityName,
        recordCount: exp.recordCount,
        fileSize: this.formatFileSize(exp.fileSize),
        generatedAt: exp.generatedAt,
        downloadCount: exp.downloadCount,
        downloadUrl: `/api/exports/download/${exp._id}`
      }));
    } catch (error) {
      console.error('Failed to get active exports:', error);
      throw error;
    }
  }

  /**
   * Get latest full export (for immediate download)
   */
  async getLatestFullExport() {
    try {
      const exportFile = await ExportFile.findOne({
        fileType: 'full',
        isActive: true
      }).sort({ generatedAt: -1 });

      if (!exportFile) {
        return null;
      }

      // Check if file exists
      const exists = await fs.pathExists(exportFile.filePath);
      if (!exists) {
        throw new Error('File not found on disk');
      }

      return exportFile;
    } catch (error) {
      console.error('Failed to get latest full export:', error);
      throw error;
    }
  }

  /**
   * Get download stream for a file
   */
  async getDownloadStream(fileId) {
    try {
      const exportFile = await ExportFile.findById(fileId);
      
      if (!exportFile) {
        throw new Error('Export file not found');
      }

      if (!exportFile.isActive) {
        throw new Error('Export file is no longer available');
      }

      // Check if file exists
      const exists = await fs.pathExists(exportFile.filePath);
      if (!exists) {
        throw new Error('File not found on disk');
      }

      // Update download stats
      exportFile.downloadCount += 1;
      exportFile.lastDownloadedAt = new Date();
      await exportFile.save();

      // Return file stream info
      const stats = await fs.stat(exportFile.filePath);
      
      return {
        filePath: exportFile.filePath,
        filename: exportFile.filename,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: stats.size
      };

    } catch (error) {
      console.error('Failed to get download stream:', error);
      throw error;
    }
  }

  /**
   * Clean up old export files (keep only last 7 days)
   */
  async cleanupOldExports() {
    try {
      console.log('🧹 Starting export cleanup...');
      
      // Find files older than 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const oldFiles = await ExportFile.find({
        generatedAt: { $lt: sevenDaysAgo },
        isActive: true
      });

      let deletedCount = 0;
      let errorCount = 0;

      for (const file of oldFiles) {
        try {
          // Delete physical file
          if (await fs.pathExists(file.filePath)) {
            await fs.unlink(file.filePath);
          }
          
          // Mark as inactive in database
          file.isActive = false;
          await file.save();
          
          deletedCount++;
          
        } catch (error) {
          console.error(`Failed to delete file ${file.filename}:`, error);
          errorCount++;
        }
      }

      console.log(`✅ Cleanup completed: ${deletedCount} files deleted, ${errorCount} errors`);
      
      return {
        deletedCount,
        errorCount,
        totalProcessed: oldFiles.length
      };

    } catch (error) {
      console.error('Cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}