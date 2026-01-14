// routes/exportRoutes.js
import express from 'express';
import { ExportManager } from '../services/export/ExportManager.js';
import { ExportScheduler } from '../services/export/ExportScheduler.js';
import Site from '../models/Site.js';
import StaffProfile from '../models/StaffProfile.js';
import ExportFile from '../models/ExportFile.js';
import fs from 'fs';

const router = express.Router();
const exportManager = new ExportManager();
const exportScheduler = new ExportScheduler();

// Initialize scheduler when routes are loaded
exportScheduler.initialize();

/**
 * GET /api/exports/status
 * Get system status
 */
router.get('/status', async (req, res) => {
  try {
    const schedulerStatus = exportScheduler.getStatus();
    
    res.json({
      success: true,
      scheduler: schedulerStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/exports/download/all
 * Download latest full export (all universities) - SERVES EXISTING FILE ONLY
 */
router.get('/download/all', async (req, res) => {

  try {
    console.log('📥 Download request for existing export');
    
    // 1. Find the latest ACTIVE full export from database
    const exportFile = await ExportFile.findOne({
      fileType: 'full',
      isActive: true
    }).sort({ generatedAt: -1 });

    if (!exportFile) {
      return res.status(404).json({ 
        error: 'No export file found. Please generate an export first using the "Generate Export" button.' 
      });
    }

    // 2. Check if the physical file exists on server
    if (!fs.existsSync(exportFile.filePath)) {
      return res.status(404).json({ 
        error: 'Export file not found on server. Please regenerate the export.' 
      });
    }

    // 3. Get file stats
    const fileStats = fs.statSync(exportFile.filePath);
    
    // 4. Update download count
    exportFile.downloadCount += 1;
    exportFile.lastDownloadedAt = new Date();
    await exportFile.save();

    // 5. Set headers and stream file
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${exportFile.filename}"`);
    res.setHeader('Content-Length', fileStats.size);
    
    console.log(`📤 Streaming existing file: ${exportFile.filename} (${fileStats.size} bytes)`);

    // 6. Stream the file
    const fileStream = fs.createReadStream(exportFile.filePath);
    fileStream.pipe(res);
    
    fileStream.on('error', (error) => {
      console.error('File stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream file' });
      }
    });
    
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/exports/generation-status
 * Check if export generation is currently in progress
 */
router.get('/generation-status', (req, res) => {
  try {
    const status = exportManager.getGenerationStatus();
    
    res.json({
      success: true,
      isGenerating: status.isGenerating,
      timestamp: status.timestamp
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/exports/generate/new
 * Generate a BRAND NEW export file (with duplicate prevention)
 */
router.post('/generate/new', async (req, res) => {
  try {
    console.log('🔄 Received request to generate new export');
    
    // Check if generation is already in progress
    const generationStatus = exportManager.getGenerationStatus();
    if (generationStatus.isGenerating) {
      return res.status(409).json({
        success: false,
        error: 'Export generation is already in progress. Please wait for it to complete.'
      });
    }
    
    // Generate new export file
    const result = await exportManager.generateFullExport();
    
    if (!result.success) {
      throw new Error('Failed to generate export');
    }
    
    res.json({
      success: true,
      message: result.alreadyExists ? 
        'Export already exists, using existing file.' : 
        'New export file generated successfully!',
      fileInfo: {
        filename: result.filename,
        recordCount: result.recordCount,
        fileSize: result.fileSize,
        downloadUrl: `/api/exports/download/${result.fileId}`
      }
    });
    
  } catch (error) {
    console.error('Generate error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/exports/check
 * Check if export exists and get its info + generation status
 */
router.get('/check', async (req, res) => {
  try {
    // Get generation status
    const generationStatus = exportManager.getGenerationStatus();
    
    // Get export file info
    const exportFile = await ExportFile.findOne({
      fileType: 'full',
      isActive: true
    }).sort({ generatedAt: -1 });
    
    if (!exportFile) {
      return res.json({
        exists: false,
        isGenerating: generationStatus.isGenerating,
        message: 'No export file available'
      });
    }
    
    // Check if file physically exists
    const fileExists = fs.existsSync(exportFile.filePath);
    
    res.json({
      exists: fileExists,
      isGenerating: generationStatus.isGenerating,
      fileInfo: {
        id: exportFile._id,
        filename: exportFile.filename,
        fileSize: exportManager.formatFileSize(exportFile.fileSize),
        recordCount: exportFile.recordCount,
        generatedAt: exportFile.generatedAt,
        downloadCount: exportFile.downloadCount,
        downloadUrl: `/api/exports/download/${exportFile._id}`
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/exports/download/university/:siteId
 * Generate and download university export
 */
router.get('/download/university/:siteId', async (req, res) => {
  try {
    const { siteId } = req.params;
    
    console.log(`🎓 Generating university export for: ${siteId}`);
    
    // Generate the export (on-demand for single university)
    const result = await exportManager.generateUniversityExport(siteId);
    
    // Get file stream
    const fileInfo = await exportManager.getDownloadStream(result.fileId);
    
    res.setHeader('Content-Type', fileInfo.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.filename}"`);
    res.setHeader('Content-Length', fileInfo.size);
    
    // Stream the file
    const fileStream = fs.createReadStream(fileInfo.filePath);
    fileStream.pipe(res);
    
    fileStream.on('error', (error) => {
      console.error('File stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream file' });
      }
    });
    
  } catch (error) {
    console.error('University download error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/exports/universities
 * Get list of universities
 */
router.get('/universities', async (req, res) => {
  try {
    const universities = await Site.find()
      .select('_id baseUrl')
      .sort({ baseUrl: 1 })
      .lean();
    
    // Get profile counts for each university
    const universitiesWithCounts = await Promise.all(
      universities.map(async (uni) => {
        const count = await StaffProfile.countDocuments({ site: uni._id });
        return {
          id: uni._id,
          baseUrl: uni.baseUrl,
          profileCount: count
        };
      })
    );

    res.json({
      success: true,
      count: universitiesWithCounts.length,
      universities: universitiesWithCounts
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/exports/generate/full
 * Manually trigger full export generation
 */
router.post('/generate/full', async (req, res) => {
  try {
    console.log('👤 Manual full export requested');
    
    const result = await exportScheduler.triggerManualExport();
    
    res.json({
      success: true,
      message: 'Full export generation started',
      result: result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;