// index.js
import express from "express";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Import database connection
import { connectDB, getConnectionStatus } from "./config/database.js";

// Models
import Site from "./models/Site.js";
import Snapshot from "./models/Snapshot.js";
import FailedDirectory from "./models/FailedDirectory.js";
import ChangeLog from "./models/ChangeLog.js";

// Services
import processStaffDirectory from "./utils/processStaffDirectory.js";
import schedulerService from "./services/schedulerService.js";
import { createTestSnapshots } from './utils/test-snapshots.js';

const app = express();
const PORT = process.env.PORT || 3000;

const __dirname = dirname(fileURLToPath(import.meta.url));

// Middleware
app.use(express.json());
app.use(express.static('public'));



// Health check endpoint
app.get("/health", (req, res) => {
  const dbStatus = getConnectionStatus();
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    database: dbStatus,
    uptime: process.uptime()
  });
});

// Database status endpoint
app.get("/db-status", (req, res) => {
  const status = getConnectionStatus();
  res.json({
    database: status,
    message: status.isConnected ? "✅ Database connected" : "❌ Database disconnected"
  });
});

// Your existing routes remain the same...
app.post("/scrape-now", async (req, res) => {
  try {
    await schedulerService.triggerManualScraping();
    res.json({ message: "Manual scraping started" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/scrape-status", (req, res) => {
  res.json({ 
    isRunning: schedulerService.isRunning,
    nextScheduled: "1st of every month at 2:00 AM"
  });
});


app.get("/sites", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';

    // Build query for search
    let query = {};
    if (search) {
      query = {
        $or: [
          { baseUrl: { $regex: search, $options: 'i' } },
          { staffDirectory: { $regex: search, $options: 'i' } }
        ]
      };
    }

    // Get total count for pagination
    const totalSites = await Site.countDocuments(query);
    
    
    // Get paginated sites
    const sites = await Site.find(query)
      .select('_id baseUrl staffDirectory lastScrapedAt createdAt')
      .sort({ lastScrapedAt: -1 })
      .skip(skip)
      .limit(limit);

    
    
    res.json({
      sites,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalSites / limit),
        totalSites,
        hasNext: page < Math.ceil(totalSites / limit),
        hasPrev: page > 1
      },
      search: search
    });
  } catch (error) {
    console.error('Error in /sites route:', error);
    res.status(500).json({ error: error.message });
  }
});
app.get("/failed-directories", async (req, res) => {
  try {
    const failedDirs = await FailedDirectory.find().sort({ lastAttempt: -1 });
    
    res.json({
      count: failedDirs.length,
      failedDirectories: failedDirs.map(dir => ({
        _id: dir._id,
        baseUrl: dir.baseUrl,
        staffDirectory: dir.staffDirectory,
        failureType: dir.failureType,
        errorMessage: dir.errorMessage,
        attemptCount: dir.attemptCount,
        lastAttempt: dir.lastAttempt,
        createdAt: dir.createdAt,
        htmlSnippet: dir.htmlContent ? dir.htmlContent.substring(0, 200) + '...' : null
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/failed-directories", async (req, res) => {
  try {
    const result = await FailedDirectory.deleteMany({});
    res.json({ 
      message: "All failed directories cleared",
      deletedCount: result.deletedCount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/site/:siteId/snapshot", async (req, res) => {
  try {
    const site = await Site.findById(req.params.siteId);
    if (!site) {
      return res.status(404).json({ error: "Site not found" });
    }

    const snapshot = await Snapshot.findById(site.latestSnapshot)
      .populate('site');
    
    if (!snapshot) {
      return res.status(404).json({ error: "No snapshot found for this site" });
    }

    res.json({
      site: {
        baseUrl: site.baseUrl,
        staffDirectory: site.staffDirectory
      },
      snapshot: {
        snapshotDate: snapshot.snapshotDate,
        totalCount: snapshot.totalCount,
        categories: snapshot.categories
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/site/:siteId/changes", async (req, res) => {
  try {
    const site = await Site.findById(req.params.siteId);
    if (!site) {
      return res.status(404).json({ error: "Site not found" });
    }

    const changes = await ChangeLog.find({ site: site._id })
      .populate('fromSnapshot toSnapshot')
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      site: {
        baseUrl: site.baseUrl,
        staffDirectory: site.staffDirectory
      },
      changes: changes.map(change => ({
        id: change._id,
        date: change.createdAt,
        fromSnapshot: change.fromSnapshot?.snapshotDate,
        toSnapshot: change.toSnapshot?.snapshotDate,
        addedCount: change.added?.length || 0,
        removedCount: change.removed?.length || 0,
        updatedCount: change.updated?.length || 0,
        details: change
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/site/:siteId/snapshots", async (req, res) => {
  try {
    const site = await Site.findById(req.params.siteId);
    if (!site) {
      return res.status(404).json({ error: "Site not found" });
    }

    const snapshots = await Snapshot.find({ site: site._id })
      .sort({ snapshotDate: -1 });

    res.json({
      site: {
        _id: site._id,
        baseUrl: site.baseUrl,
        staffDirectory: site.staffDirectory
      },
      snapCount: snapshots.length,
      snapshots: snapshots.map(snap => ({
        _id: snap._id,
        snapshotDate: snap.snapshotDate,
        totalCount: snap.totalCount,
        categories: snap.categories.map(cat => ({
          name: cat.name,
          count: cat.count,
          members: cat.members
        })),
        runId: snap.runId,
        hash: snap.hash,
        site: snap?.site
      })),
      totalSnapshots: snapshots.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});  

app.get("/changes", (req, res) => {
  res.sendFile(join(__dirname, "public", "changes.html"));
});

app.get('/test-change-detection', async (req, res) => {
  try {
    const { siteId } = req.query;
    
    if (!siteId) {
      return res.status(400).json({
        success: false,
        error: 'siteId query parameter is required'
      });
    }

    const testResults = await createTestSnapshots(siteId);
    
    res.json(testResults);
    
  } catch (error) {
    console.error('Error in test endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start server
app.listen(PORT, async () => {
  try {
    await connectDB();
    console.log(`🚀 Server running at http://localhost:${PORT}`);
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
});