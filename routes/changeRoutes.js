import express from "express";
import mongoose from "mongoose";
const route = express.Router();
import {requireAuth, requireAuthAPI} from "../middleware/auth.js"
import ChangeLog from "../models/ChangeLog.js";
import changeDetectionService from "../services/changeDetectionService.js";
import Site from "../models/Site.js";
import Snapshot from "../models/Snapshot.js";
import { compareSnapshotsFuzzy } from "../utils/diffEngine.js";
// New route to get sites with changes (for changes dashboard)
route.get("/sites-with-changes", requireAuthAPI, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';

        // First, find all sites that have changelogs
        const sitesWithChanges = await ChangeLog.aggregate([
            {
                $group: {
                    _id: "$site",
                    changeCount: { $sum: 1 },
                    lastChange: { $max: "$createdAt" }
                }
            },
            {
                $lookup: {
                    from: "sites",
                    localField: "_id",
                    foreignField: "_id",
                    as: "site"
                }
            },
            {
                $unwind: "$site"
            },
            {
                $match: search ? {
                    $or: [
                        { "site.baseUrl": { $regex: search, $options: 'i' } },
                        { "site.staffDirectory": { $regex: search, $options: 'i' } }
                    ]
                } : {}
            },
            {
                $project: {
                    _id: "$site._id",
                    baseUrl: "$site.baseUrl",
                    staffDirectory: "$site.staffDirectory",
                    lastScrapedAt: "$site.lastScrapedAt",
                    createdAt: "$site.createdAt",
                    changeCount: 1,
                    lastChange: 1
                }
            },
            {
                $sort: { lastChange: -1 }
            }
        ]);

        // Apply pagination manually
        const totalSites = sitesWithChanges.length;
        const paginatedSites = sitesWithChanges.slice(skip, skip + limit);

        res.json({
            sites: paginatedSites,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalSites / limit),
                totalSites,
                hasNext: page < Math.ceil(totalSites / limit),
                hasPrev: page > 1
            },
            search: search,
            stats: {
                totalChangedSites: totalSites,
                totalChanges: await ChangeLog.countDocuments()
            }
        });
    } catch (error) {
        console.error('Error in /sites-with-changes route:', error);
        res.status(500).json({ error: error.message });
    }
});

// New route to get detailed changes for a specific site
route.get("/api/site-changes-details/:siteId", requireAuthAPI, async (req, res) => {
    const { siteId } = req.params;
    console.log(`📡 GET /api/site-changes-details/${siteId} - Request Received`);

    try {
        const limit = parseInt(req.query.limit) || 10;
        
        // 1. Get site info
        const site = await Site.findById(siteId).lean();
        if (!site) {
            console.log(`❌ Site not found: ${siteId}`);
            return res.status(404).json({ error: "Site not found" });
        }

        // 2. Get changes and summary stats in parallel for speed
        const querySiteId = new mongoose.Types.ObjectId(siteId);
        
        console.log(`🗄️ Querying MongoDB for site: ${siteId}...`);
        const [changes, stats] = await Promise.all([
            ChangeLog.find({ site: querySiteId })
                .populate('fromSnapshot toSnapshot')
                .sort({ createdAt: -1 })
                .limit(limit)
                .lean(),
            ChangeLog.aggregate([
                { $match: { site: querySiteId } },
                {
                    $group: {
                        _id: null,
                        totalAdded: { $sum: { $size: { $ifNull: ["$added", []] } } },
                        totalRemoved: { $sum: { $size: { $ifNull: ["$removed", []] } } },
                        totalUpdated: { $sum: { $size: { $ifNull: ["$updated", []] } } },
                        totalChanges: { $sum: 1 }
                    }
                }
            ])
        ]);

        console.log(`✅ Raw DB Result: Found ${changes.length} records. Stats:`, stats[0] || 'No stats');
        console.log(`✅ Query Complete: Found ${changes.length} changes for ${site.baseUrl}`);

        const summary = stats[0] || { totalAdded: 0, totalRemoved: 0, totalUpdated: 0, totalChanges: 0 };
        
        res.json({
            site: {
                _id: site._id,
                baseUrl: site.baseUrl,
                staffDirectory: site.staffDirectory,
                lastScrapedAt: site.lastScrapedAt
            },
            statistics: {
                totalChanges: summary.totalChanges || 0,
                totalAdded: summary.totalAdded || 0,
                totalRemoved: summary.totalRemoved || 0,
                totalUpdated: summary.totalUpdated || 0
            },
            changes: changes.map(change => ({
                id: change._id,
                date: change.createdAt,
                fromDate: change.fromSnapshot?.snapshotDate,
                toDate: change.toSnapshot?.snapshotDate,
                addedCount: (change.added || []).length,
                removedCount: (change.removed || []).length,
                updatedCount: (change.updated || []).length,
                details: {
                    added: (change.added || []).map(item => ({
                        name: item.name || item.staffName || item.title || 'Unknown',
                        fingerprint: item.fingerprint,
                        categories: item.categories || []
                    })),
                    removed: (change.removed || []).map(item => ({
                        name: item.name || item.staffName || item.title || 'Unknown',
                        fingerprint: item.fingerprint,
                        categories: item.categories || []
                    })),
                    updated: (change.updated || []).map(item => ({
                        fingerprint: item.fingerprint,
                        name: item.name || item.before?.name || item.after?.name || 'Unknown',
                        diffs: item.diffs || {},
                        categories: item.categories || item.after?.categories || []
                    }))
                }
            }))
        });
    } catch (error) {
        console.error('❌ Error in /api/site-changes-details route:', error);
        res.status(500).json({ error: error.message });
    }
});

// [DEBUG] Route to get a random change with full snapshot data for visual testing
route.get("/api/debug/random-change", requireAuthAPI, async (req, res) => {
    try {
        const { siteId } = req.query;
        let matchStage = { fromSnapshot: { $exists: true }, toSnapshot: { $exists: true } };
        
        if (siteId) {
            matchStage.site = new mongoose.Types.ObjectId(siteId);
        }

        // 1. Get a random ChangeLog
        const randomChanges = await ChangeLog.aggregate([
            { $match: matchStage },
            { $sample: { size: 1 } }
        ]);

        if (randomChanges.length === 0) {
            return res.status(404).json({ error: "No change records found with valid snapshots." });
        }

        const changeRecord = randomChanges[0];

        // 2. Fetch the full snapshots and site info
        const populatedChange = await ChangeLog.findById(changeRecord._id)
            .populate('site')
            .populate('fromSnapshot')
            .populate('toSnapshot');

        res.json(populatedChange);
    } catch (error) {
        console.error('Error in debug route:', error);
        res.status(500).json({ error: error.message });
    }
});


// Safety lock to prevent multiple concurrent runs
let isReprocessing = false;

// [DEBUG] Reprocess all changes using the new Fuzzy Match Logic (RESUMEABLE)
route.get("/api/debug/reprocess-all-changes", requireAuthAPI, async (req, res) => {
    if (isReprocessing) {
        return res.json({ success: false, message: "A reprocess is already running in the background. Check server console for progress." });
    }

    const { restart, siteId } = req.query;
    
    // Respond immediately with site count
    const siteCount = await Site.countDocuments();
    res.json({ 
        success: true, 
        message: `Reprocess started in background (${restart === 'true' ? 'FULL' : 'RESUMEABLE'}).`,
        totalSites: siteCount,
        estimatedTime: `${Math.ceil(siteCount / 10)} seconds`,
        instruction: "Check your terminal for progress. Wait for 'Reprocessing complete' before exporting."
    });

    // Start the process in the background
    (async () => {
        await changeDetectionService.reprocessAllChanges({ 
            restart: restart === 'true', 
            siteId: siteId 
        });
    })();
});

// --- EXPORT ROUTES ---
import { ExportManager } from "../services/export/ExportManager.js";
const exportManager = new ExportManager();

// Get latest export status
route.get("/api/export-changes/status", requireAuthAPI, async (req, res) => {
    try {
        const latest = await exportManager.getLatestChangesExport();
        res.json({
            isGenerating: exportManager.isGenerating,
            latest: latest ? {
                filename: latest.filename,
                generatedAt: latest.generatedAt,
                size: latest.fileSize
            } : null
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Trigger new export generation
route.post("/api/export-changes/generate", requireAuthAPI, async (req, res) => {
    try {
        if (exportManager.isGenerating) {
            return res.status(409).json({ message: "Export already in progress" });
        }
        
        // Start generation in background
        exportManager.generateChangesExport().catch(err => console.error("Export Background Error:", err));
        
        res.json({ success: true, message: "Export generation started" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Download the latest export
route.get("/api/export-changes/download", requireAuth, async (req, res) => {
    try {
        const latest = await exportManager.getLatestChangesExport();
        if (!latest) return res.status(404).send("No export file found");
        
        res.download(latest.filePath, latest.filename);
    } catch (error) {
        res.status(500).send(error.message);
    }
});

export default route;