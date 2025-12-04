// index.js
import express from "express";
import session from 'express-session';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();
// Import database connection
import { connectDB, getConnectionStatus } from "./config/database.js";

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
import { createTestSnapshots } from './utils/test-snapshots.js';

// Routes
import searchRoutes from './routes/search.js';
import authRoutes from './routes/auth.js';
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

// Auth middleware
const requireAuth = (req, res, next) => {
    console.log("requireAuth", req.session.user)
    if (!req.session.user) {
      console.log("not logged in")
        return res.redirect('/login');
    }
    next();
};

// Auth middleware for API routes
const requireAuthAPI = (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    next();
};

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/exports', exportRoutes);
app.use('/api', searchRoutes);
app.use('/css', express.static(join(__dirname, 'public/css')));
app.use('/js', express.static(join(__dirname, 'public/js')));

// Serve the main HTML file on root route - PROTECTED
app.get("/", requireAuth, (req, res) => {
    res.sendFile(join(__dirname, "public", "index.html"));
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


// Protected route example
app.get('/api/protected', requireAuthAPI, (req, res) => {
    res.json({ message: 'This is protected data', user: req.session.user });
});



app.get("/search", requireAuth, (req, res) => {
    res.sendFile(join(__dirname, "public", "search.html"));
});

// Health check endpoint - public
app.get("/health", (req, res) => {
    const dbStatus = getConnectionStatus();
    res.json({
        status: "OK",
        timestamp: new Date().toISOString(),
        database: dbStatus,
        uptime: process.uptime()
    });
});

// Database status endpoint - public
app.get("/db-status", (req, res) => {
    const status = getConnectionStatus();
    res.json({
        database: status,
        message: status.isConnected ? "✅ Database connected" : "❌ Database disconnected"
    });
});

// Protect all these routes with authentication
app.post("/scrape-now", requireAuthAPI, async (req, res) => {
    try {
        await schedulerService.triggerManualScraping();
        res.json({ message: "Manual scraping started" });
    } catch (error) {
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

app.get("/scrape-status", requireAuthAPI, (req, res) => {
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
app.get('/download', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'download.html'));
});



// 404 Handler
app.use((req, res) => {
    res.status(404).sendFile(join(__dirname, "public", '404.html'));
});

// MongoDB Connection
mongoose.connect("mongodb+srv://learnFirstAdmin:mT4aOUQ8IeZlGqf6@khareedofrokht.h4nje.mongodb.net/universities?retryWrites=true&w=majority&appName=khareedofrokht", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => {
    console.log("✅ Connected to MongoDB");
    app.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
})
.catch((err) => {
    console.error("❌ MongoDB connection error:", err);
});