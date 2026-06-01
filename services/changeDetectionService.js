import mongoose from 'mongoose';
import ChangeLog from '../models/ChangeLog.js';
import Snapshot from '../models/Snapshot.js';
import Site from '../models/Site.js';
import { compareSnapshotsFuzzy } from '../utils/diffEngine.js';

class ChangeDetectionService {
    constructor() {
        this.isProcessing = false;
    }

    /**
     * Reprocesses all changes for all active sites.
     * @param {Object} options - { restart: boolean, siteId: string }
     */
    async reprocessAllChanges(options = {}) {
        if (this.isProcessing) {
            console.log("⚠️ Change detection already in progress, skipping...");
            return { success: false, message: "Already in progress" };
        }

        const { restart = true, siteId = null } = options;
        
        try {
            this.isProcessing = true;
            console.log(`🚀 Starting ${restart ? 'FULL' : 'RESUMEABLE'} Reprocess of ChangeLogs...`);
            
            if (restart) {
                if (siteId) {
                    const deletedCount = await ChangeLog.deleteMany({ site: siteId });
                    console.log(`🗑️ Cleared ${deletedCount.deletedCount} ChangeLogs for site: ${siteId}`);
                } else {
                    const totalBefore = await ChangeLog.countDocuments();
                    const deletedResult = await ChangeLog.deleteMany({});
                    console.log(`🗑️ Cleared ${deletedResult.deletedCount}/${totalBefore} ALL ChangeLogs.`);
                }
            }

            let query = {};
            if (siteId) query._id = siteId;
            const sites = await Site.find(query);
            console.log(`🔍 Found ${sites.length} sites to reprocess.`);
            
            let totalCreated = 0;
            let skipped = 0;

            if (sites.length === 0) {
                console.log("⚠️ No sites found to reprocess!");
                this.isProcessing = false;
                return { success: true, totalCreated: 0, message: "No sites found" };
            }

            for (const site of sites) {
                // Skip if site already has logs and we aren't restarting
                const existingCount = await ChangeLog.countDocuments({ site: site._id });
                if (existingCount > 0 && !restart) {
                    skipped++;
                    continue;
                }

                // If resuming site-by-site
                if (restart && !siteId) {
                     // We already cleared all above, so no need to clear per-site
                } else if (restart && siteId) {
                     // Cleared above
                } else {
                    // Resuming - only clear this site if we are actually processing it
                    await ChangeLog.deleteMany({ site: site._id });
                }

                const snapshots = await Snapshot.find({ site: site._id }).sort({ snapshotDate: 1 }).lean();
                if (snapshots.length < 2) continue;

                if ((totalCreated + skipped) % 100 === 0 && (totalCreated + skipped) > 0) {
                    console.log(`⏳ Progress: ${totalCreated + skipped}/${sites.length} sites processed...`);
                }

                console.log(`📦 [${totalCreated + skipped + 1}/${sites.length}] Processing ${site.baseUrl} (${snapshots.length} snaps)`);

                for (let i = 0; i < snapshots.length - 1; i++) {
                    const oldSnap = snapshots[i];
                    const newSnap = snapshots[i + 1];

                    const { added, removed, updated } = compareSnapshotsFuzzy(oldSnap, newSnap);

                    if (added.length > 0 || removed.length > 0 || updated.length > 0) {
                        const cleanText = (txt) => (txt || '').replace(/\s+/g, ' ').trim();

                        const addedData = added.map(m => ({ 
                            name: cleanText(m.name), 
                            title: cleanText(m.title), 
                            fingerprint: m.fingerprint, 
                            categories: m.allCategories,
                            emails: m.emails,
                            phones: m.phones,
                            profileUrl: m.profileUrl
                        }));
                        const removedData = removed.map(m => ({ 
                            name: cleanText(m.name), 
                            title: cleanText(m.title), 
                            fingerprint: m.fingerprint, 
                            categories: m.allCategories,
                            emails: m.emails,
                            phones: m.phones,
                            profileUrl: m.profileUrl
                        }));
                        const updatedData = updated.map(u => ({
                            name: cleanText(u.after.name || u.before.name || u.after.raw?.name || u.before.raw?.name || 'Unknown'),
                            fingerprint: u.fingerprint || u.after.fingerprint || u.before.fingerprint,
                            diffs: u.diffs,
                            categories: u.after.allCategories,
                            emails: u.after.emails || u.before.emails,
                            phones: u.after.phones || u.before.phones,
                            profileUrl: u.after.profileUrl || u.before.profileUrl
                        }));

                        const changeLog = new ChangeLog({
                            site: site._id,
                            fromSnapshot: oldSnap._id,
                            toSnapshot: newSnap._id,
                            date: newSnap.snapshotDate,
                            addedCount: added.length,
                            removedCount: removed.length,
                            updatedCount: updated.length,
                            added: addedData,
                            removed: removedData,
                            updated: updatedData,
                            details: {
                                added: addedData,
                                removed: removedData,
                                updated: updatedData
                            }
                        });

                        await changeLog.save();
                        totalCreated++;
                    }
                }
            }

            console.log(`🏁 Reprocessing complete. Created ${totalCreated} new ChangeLogs, skipped ${skipped} sites.`);
            return { success: true, totalCreated, skipped };

        } catch (error) {
            console.error("❌ Reprocess Error:", error);
            return { success: false, error: error.message };
        } finally {
            this.isProcessing = false;
        }
    }
}

export default new ChangeDetectionService();
