import express from "express";
const route = express.Router();
import {requireAuth, requireAuthAPI} from "../middleware/auth.js"
import ChangeLog from "../models/ChangeLog.js";
import Site from "../models/Site.js";
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
    try {
        const { siteId } = req.params;
        const limit = parseInt(req.query.limit) || 10;
        
        const site = await Site.findById(siteId);
        if (!site) {
            return res.status(404).json({ error: "Site not found" });
        }

        // Get all changes for this site with details
        const changes = await ChangeLog.find({ site: siteId })
            .populate('fromSnapshot toSnapshot')
            .sort({ createdAt: -1 })
            .limit(limit);

        // Get site statistics
        const totalChanges = await ChangeLog.countDocuments({ site: siteId });
        const totalAdded = await ChangeLog.aggregate([
            { $match: { site: mongoose.Types.ObjectId(siteId) } },
            { $project: { addedCount: { $size: "$added" } } },
            { $group: { _id: null, total: { $sum: "$addedCount" } } }
        ]);

        const totalRemoved = await ChangeLog.aggregate([
            { $match: { site: mongoose.Types.ObjectId(siteId) } },
            { $project: { removedCount: { $size: "$removed" } } },
            { $group: { _id: null, total: { $sum: "$removedCount" } } }
        ]);

        const totalUpdated = await ChangeLog.aggregate([
            { $match: { site: mongoose.Types.ObjectId(siteId) } },
            { $project: { updatedCount: { $size: "$updated" } } },
            { $group: { _id: null, total: { $sum: "$updatedCount" } } }
        ]);

        res.json({
            site: {
                _id: site._id,
                baseUrl: site.baseUrl,
                staffDirectory: site.staffDirectory,
                lastScrapedAt: site.lastScrapedAt
            },
            statistics: {
                totalChanges,
                totalAdded: totalAdded[0]?.total || 0,
                totalRemoved: totalRemoved[0]?.total || 0,
                totalUpdated: totalUpdated[0]?.total || 0
            },
            changes: changes.map(change => ({
                id: change._id,
                date: change.createdAt,
                fromDate: change.fromSnapshot?.snapshotDate,
                toDate: change.toSnapshot?.snapshotDate,
                addedCount: change.added?.length || 0,
                removedCount: change.removed?.length || 0,
                updatedCount: change.updated?.length || 0,
                details: {
                    added: change.added?.map(item => ({
                        name: item.name,
                        fingerprint: item.fingerprint,
                        categories: item.categories
                    })) || [],
                    removed: change.removed?.map(item => ({
                        name: item.name,
                        fingerprint: item.fingerprint,
                        categories: item.categories
                    })) || [],
                    updated: change.updated?.map(item => ({
                        fingerprint: item.fingerprint,
                        name: item.name,
                        diffs: item.diffs
                    })) || []
                }
            }))
        });
    } catch (error) {
        console.error('Error in /api/site-changes-details route:', error);
        res.status(500).json({ error: error.message });
    }
});

export default route;