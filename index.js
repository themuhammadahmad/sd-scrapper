// index.js
import express from "express";
import session from 'express-session';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import mongoose, { mongo } from "mongoose";
import dotenv from "dotenv";
dotenv.config();
// Import database connection
// import { connectDB, getConnectionStatus } from "./config/database.js";

// Models
import Site from "./models/Site.js";
import Snapshot from "./models/Snapshot.js";
import FailedDirectory from "./models/FailedDirectory.js";
import ChangeLog from "./models/ChangeLog.js";
import StaffDirectory from "./models/StaffDirectory.js";
import StaffProfile from './models/StaffProfile.js'; // Make sure to import

// Services
import processStaffDirectory from "./utils/processStaffDirectory.js";
import schedulerService from "./services/schedulerService.js";
import { ExportScheduler } from './services/export/ExportScheduler.js';
import { createTestSnapshots } from './utils/test-snapshots.js';


// Initialize scheduler
const exportScheduler = new ExportScheduler();
exportScheduler.initialize();


schedulerService.setExportScheduler(exportScheduler);


schedulerService.triggerManualScraping();
schedulerService.initializeMonthlyScheduling();


// Routes
import searchRoutes from './routes/search.js';
import authRoutes from './routes/auth.js';
import changeRoutes from './routes/changeRoutes.js';
import exportRoutes from './routes/exportRoutes.js';
// ... your imports remain the same ...

const app = express();
const PORT = process.env.PORT || 3000;

const __dirname = dirname(fileURLToPath(import.meta.url));

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Session middleware
app.use(session({
    secret: 'your-secret-key-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Set to true if using HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

import {requireAuth, requireAuthAPI} from "./middleware/auth.js"

// Routes
app.use('/api/auth', authRoutes);
app.use('/', changeRoutes);
app.use('/api/exports', requireAuth,exportRoutes);
app.use('/api', searchRoutes);
app.use('/css', express.static(join(__dirname, 'public/css')));
app.use('/js', express.static(join(__dirname, 'public/js')));


// Route to check monthly scheduling status
app.get("/api/monthly-scheduling-status", requireAuthAPI, (req, res) => {
  try {
    const status = schedulerService.getMonthlySchedulingStatus();
    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    console.error('Error getting monthly scheduling status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// In your Express app
app.get('/export-dashboard', (req, res) => {
  res.sendFile(join(__dirname, "public", "export-dashboard.html"));
});
// API Routes for manual export
app.get('/api/exports/trigger', async (req, res) => {
  try {
    console.log('📤 Manual export triggered via API');
    const result = await exportScheduler.triggerManualExport();
    
    res.json({
      success: true,
      message: 'Export triggered successfully',
      data: result
    });
  } catch (error) {
    console.error('Error triggering export:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger export',
      error: error.message
    });
  }
});

// Serve the main HTML file on root route - PROTECTED
app.get("/", requireAuth, (req, res) => {
    
    res.sendFile(join(__dirname, "public", "index2.html"));
});
// Serve HTML pages
app.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/');
    }
    res.sendFile(join(__dirname, "public", 'login.html'));
});

app.get('/signup', (req, res) => {
    // If already logged in, redirect to home
    if (req.session.user) {
        return res.redirect('/');
    }
    res.sendFile(join(__dirname, "public", 'signup.html'));
});
// Serve the new changes dashboard page
app.get("/changes", requireAuth, (req, res) => {
    res.sendFile(join(__dirname, "public", "changes.html"));
});

// Protected route example
app.get('/api/protected', requireAuthAPI, (req, res) => {
    res.json({ message: 'This is protected data', user: req.session.user });
});



app.get("/search", requireAuth, (req, res) => {
    res.sendFile(join(__dirname, "public", "search.html"));
});

// // Health check endpoint - public
// app.get("/health", (req, res) => {
//     const dbStatus = getConnectionStatus();
//     res.json({
//         status: "OK",
//         timestamp: new Date().toISOString(),
//         database: dbStatus,
//         uptime: process.uptime()
//     });
// });

// // Database status endpoint - public
// app.get("/db-status", (req, res) => {
//     const status = getConnectionStatus();
//     res.json({
//         database: status,
//         message: status.isConnected ? "✅ Database connected" : "❌ Database disconnected"
//     });
// });

// Protect all these routes with authentication
app.post("/scrape-now", requireAuthAPI, async (req, res) => {
    try {
        await schedulerService.triggerManualScraping();
        res.json({ message: "Manual scraping started" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// In your route file
import puppeteerManager from './services/puppeteerManager.js';
app.get("/browser-stats", requireAuthAPI, (req, res) => {
  res.json(puppeteerManager.getStats());
});
// Route to scrape a single site by ID
app.post("/scrape-site/:siteId", requireAuthAPI, async (req, res) => {
  try {
    const siteId = req.params.siteId;
    
    // Get scheduler status
    const schedulerStatus = schedulerService.getStatus();
    
    // If scheduler is running, wait or queue the request
    if (schedulerStatus.isRunning) {
      console.log(`⏳ Scheduler is busy, waiting to scrape site: ${siteId}`);
      
      // Option 1: Queue the request
      return res.status(429).json({ 
        message: 'Scraping in progress. Please try again in a few minutes.',
        estimatedWait: '2-3 minutes'
      });
      
      // Option 2: Add to queue (more complex implementation)
    }

    // Find the site and proceed with scraping
    const site = await Site.findById(siteId);
    if (!site) {
      return res.status(404).json({ error: "Site not found" });
    }

    // Get browser stats for monitoring
    const browserStats = puppeteerManager.getStats();
    console.log('Browser stats before scraping:', browserStats);

    // Scrape the single site
    const staffDirectory = await StaffDirectory.findOne({ 
      baseUrl: site.baseUrl 
    });

    const result = await processStaffDirectory(
      site.baseUrl,
      site.staffDirectory,
      staffDirectory?.successfulParser || null
    );

    // Clean up browser if no other requests
    if (puppeteerManager.activeRequests === 0) {
      setTimeout(() => puppeteerManager.closeBrowser(), 3000);
    }

    if (result.success) {
      res.json({ 
        success: true, 
        message: `Successfully scraped ${site.baseUrl}`,
        staffCount: result.staffCount
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: `Failed to scrape ${site.baseUrl}` 
      });
    }

  } catch (error) {
    console.error('Error scraping single site:', error);
    res.status(500).json({ error: error.message });
  }
});



app.get('/check-directories', requireAuthAPI, async (req, res) => {
    const count = await StaffDirectory.countDocuments();
    res.json({ totalCount: count });
});

app.post('/import', requireAuthAPI, async (req, res) => {
    try {
        const { urls } = req.body;
        
        if (!urls || !Array.isArray(urls)) {
            return res.status(400).json({ error: 'URLs array is required' });
        }

        const result = await schedulerService.importDirectories(urls);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/:id/reset-parser', requireAuthAPI, async (req, res) => {
    try {
        const directory = await StaffDirectory.findByIdAndUpdate(
            req.params.id,
            { 
                successfulParser: null,
                parserFailedLastTime: false 
            },
            { new: true }
        );
        
        res.json({ 
            success: true, 
            message: 'Parser reset successfully',
            directory 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post("/stop-scraping", requireAuthAPI, async (req, res) => {
    try {
        const result = schedulerService.stopScraping();
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/api/scrape-status", requireAuthAPI, (req, res) => {
    const status = schedulerService.getStatus();
    res.json(status);
});

app.get("/sites", requireAuthAPI, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';

        let query = {};
        if (search) {
            query = {
                $or: [
                    { baseUrl: { $regex: search, $options: 'i' } },
                    { staffDirectory: { $regex: search, $options: 'i' } }
                ]
            };
        }

        const totalSites = await Site.countDocuments(query);
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

app.get("/failed-directories", requireAuthAPI, async (req, res) => {
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

// Route to get a site by URL
app.get("/site-by-url", requireAuthAPI, async (req, res) => {
    try {
        const url = req.query.url;
        if (!url) {
            return res.status(400).json({ error: "URL parameter is required" });
        }

        const site = await Site.findOne({ baseUrl: url });
        
        if (site) {
            res.json({ success: true, site });
        } else {
            res.json({ success: false, message: "Site not found" });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// Route to scrape a single directory (for failed sites)
app.post("/scrape-failed-site", requireAuthAPI, async (req, res) => {
    try {
        const { baseUrl, staffDirectory } = req.body;
        
        if (!baseUrl || !staffDirectory) {
            return res.status(400).json({ 
                success: false, 
                error: "baseUrl and staffDirectory are required" 
            });
        }

        console.log(`🔧 Retrying failed site: ${baseUrl}`);
        
        // First, remove from failed directories if it exists
        await FailedDirectory.findOneAndDelete({ staffDirectory });
        
        // Try scraping with no known parser (null)
        const result = await processStaffDirectory(baseUrl, staffDirectory, null);

        if (result.success) {
            res.json({ 
                success: true, 
                message: `Successfully scraped ${baseUrl}`,
                staffCount: result.staffCount,
                baseUrl: baseUrl
            });
        } else {
            // Add back to failed directories - use findOneAndUpdate with upsert to avoid duplicate key error
            await FailedDirectory.findOneAndUpdate(
                { staffDirectory: staffDirectory },
                {
                    baseUrl: baseUrl,
                    staffDirectory: staffDirectory,
                    failureType: 'no_data',
                    errorMessage: 'Retry failed: No data extracted',
                    lastAttempt: new Date(),
                    $inc: { attemptCount: 1 }
                },
                { upsert: true, new: true }
            );
            
            res.status(500).json({ 
                success: false, 
                error: `Failed to scrape ${baseUrl}: No data extracted` 
            });
        }

    } catch (error) {
        console.error('Error scraping failed site:', error);
        
        // Add to failed directories with error - use findOneAndUpdate
        try {
            await FailedDirectory.findOneAndUpdate(
                { staffDirectory: req.body.staffDirectory },
                {
                    baseUrl: req.body.baseUrl,
                    staffDirectory: req.body.staffDirectory,
                    failureType: 'fetch_failed',
                    errorMessage: error.message.substring(0, 500), // Limit error message length
                    lastAttempt: new Date(),
                    $inc: { attemptCount: 1 }
                },
                { upsert: true, new: true }
            );
        } catch (dbError) {
            console.error('Error updating failed directory:', dbError);
        }
        
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});



// Route to delete a specific failed directory
app.delete("/failed-directories/:id", requireAuthAPI, async (req, res) => {
    try {
        const failedId = req.params.id;
        
        const result = await FailedDirectory.findByIdAndDelete(failedId);
        
        if (result) {
            res.json({ 
                success: true, 
                message: "Failed directory removed",
                deletedId: failedId
            });
        } else {
            res.status(404).json({ 
                success: false, 
                error: "Failed directory not found" 
            });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Route to scrape all failed directories using the scheduler pattern
app.post("/scrape-all-failed", requireAuthAPI, async (req, res) => {
    try {
        console.log('🔄 Starting bulk scrape of all failed directories');
        
        // Fetch all failed directories
        const failedDirs = await FailedDirectory.find().sort({ lastAttempt: 1 }); // Oldest first
        
        if (failedDirs.length === 0) {
            return res.json({
                success: true,
                message: "No failed directories to scrape",
                total: 0,
                processed: 0
            });
        }
        
        // Check if scheduler is already running
        const schedulerStatus = schedulerService.getStatus();
        if (schedulerStatus.isRunning) {
            return res.status(429).json({
                success: false,
                error: "Scheduler is already running. Please wait for current process to complete."
            });
        }
        
        // Start processing failed directories
        const result = await schedulerService.scrapeFailedDirectories(failedDirs);
        
        res.json({
            success: true,
            message: `Started scraping ${failedDirs.length} failed directories`,
            total: failedDirs.length,
            details: result
        });
        
    } catch (error) {
        console.error('Error starting bulk scrape:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Optional: Add status endpoint for failed directory scraping
app.get("/scrape-all-failed/status", requireAuthAPI, (req, res) => {
    const status = schedulerService.getStatus();
    const failedDirStatus = schedulerService.getFailedDirStatus ? 
        schedulerService.getFailedDirStatus() : 
        { isProcessingFailed: false };
    
    res.json({
        ...status,
        ...failedDirStatus
    });
});

app.delete("/failed-directories", requireAuthAPI, async (req, res) => {
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

app.get("/site/:siteId/snapshot", requireAuthAPI, async (req, res) => {
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

app.get("/site/:siteId/changes", requireAuthAPI, async (req, res) => {
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

app.get("/site/:siteId/snapshots", requireAuthAPI, async (req, res) => {
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

app.get("/changes", requireAuth, (req, res) => {
    res.sendFile(join(__dirname, "public", "changes.html"));
});

app.get('/test-change-detection', requireAuthAPI, async (req, res) => {
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

// Serve download page
app.get('/download', requireAuth, (req, res) => {
    res.sendFile(join(__dirname, 'public', 'download.html'));
});



// 404 Handler
app.use((req, res) => {
    res.status(404).sendFile(join(__dirname, "public", '404.html'));
});


    let mongoStr = "mongodb://127.0.0.1:27017/universities";
// Always use the environment variable (no development flag needed)
const MONGODB_URI =   process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI environment variable is required!");
  process.exit(1);
}
console.log(MONGODB_URI)
// Enhanced connection options with auto-reconnect
mongoose.connect(MONGODB_URI, {

    serverSelectionTimeoutMS: 30000,  // 30 seconds timeout
    socketTimeoutMS: 45000,           // 45 seconds socket timeout
    maxPoolSize: 10,                  // Keep 10 connections ready
    minPoolSize: 2,                   // Minimum 2 connections
    heartbeatFrequencyMS: 10000,      // Send heartbeat every 10 seconds
    retryWrites: true,
    retryReads: true
})
.then(() => {
    console.log("✅ Connected to MongoDB Atlas");
    app.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
})
.catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    console.log("💡 Tip: Check if your Atlas IP whitelist includes your server IP");
    process.exit(1); // Exit if can't connect initially
});

// Add auto-reconnect event listeners
mongoose.connection.on('disconnected', () => {
    console.log('⚠️  MongoDB disconnected. Will auto-reconnect...');
});

mongoose.connection.on('reconnected', () => {
    console.log('✅ MongoDB reconnected!');
});

mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB connection error:', err.message);
});

// Auto-reconnect logic
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;

mongoose.connection.on('disconnected', async () => {
    if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        const delay = Math.min(1000 * reconnectAttempts, 30000); // Max 30 second delay
        
        console.log(`🔄 Reconnecting in ${delay/1000} seconds (attempt ${reconnectAttempts})...`);
        
        setTimeout(async () => {
            try {
                await mongoose.connect(MONGODB_URI, {
                    useNewUrlParser: true,
                    useUnifiedTopology: true
                });
                reconnectAttempts = 0; // Reset counter on success
                console.log('✅ Reconnected successfully!');
            } catch (error) {
                console.error('❌ Reconnection failed:', error.message);
            }
        }, delay);
    } else {
        console.error('❌ Max reconnection attempts reached. Manual restart required.');
    }
});