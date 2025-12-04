// routes/exportRoutes.js
import express from 'express';
import { ExportManager } from '../services/export/ExportManager.js';
import { ExportScheduler } from '../services/export/ExportScheduler.js';
import Site from '../models/Site.js';
import StaffProfile from '../models/StaffProfile.js';
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
 * Download latest full export (all universities)
 */
router.get('/download/all', async (req, res) => {
  try {
    const exportFile = await exportManager.getLatestFullExport();
    
    if (!exportFile) {
      return res.status(404).json({ 
        error: 'No export file available. Please wait for the scheduled export to complete.' 
      });
    }

    const fileInfo = await exportManager.getDownloadStream(exportFile._id);
    
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
    console.error('Download error:', error);
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