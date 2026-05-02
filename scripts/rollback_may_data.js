import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import StaffDirectory from '../models/StaffDirectory.js';
import Snapshot from '../models/Snapshot.js';
import ChangeLog from '../models/ChangeLog.js';
import StaffProfile from '../models/StaffProfile.js';
import Site from '../models/Site.js';

const getNYTime = (dateObj) => {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: 'numeric'
    });
    const parts = formatter.formatToParts(dateObj);
    return {
        month: parseInt(parts.find(p => p.type === 'month').value, 10),
        year: parseInt(parts.find(p => p.type === 'year').value, 10)
    };
};

async function rollbackMayData() {
    try {
        if (!process.env.MONGODB_URI) {
            console.error("❌ MONGODB_URI not found in .env file");
            process.exit(1);
        }

        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("✅ Connected successfully\n");

        console.log("🔍 Scanning for data mistakenly created in May (NY Time)...");

        // 1. Delete Snapshots created in May
        const allSnapshots = await Snapshot.find({});
        const snapshotsToDelete = allSnapshots.filter(s => {
            const time = getNYTime(s.snapshotDate || s.createdAt);
            return time.month === 5 && time.year === 2026;
        });
        const snapshotIds = snapshotsToDelete.map(s => s._id);
        
        if (snapshotIds.length > 0) {
            await Snapshot.deleteMany({ _id: { $in: snapshotIds } });
            console.log(`✅ Deleted ${snapshotIds.length} Snapshots created in May.`);
        } else {
            console.log(`✅ No Snapshots to delete.`);
        }

        // 2. Delete ChangeLogs created in May
        const allChangeLogs = await ChangeLog.find({});
        const changeLogsToDelete = allChangeLogs.filter(c => {
            const time = getNYTime(c.createdAt);
            return time.month === 5 && time.year === 2026;
        });
        const changeLogIds = changeLogsToDelete.map(c => c._id);

        if (changeLogIds.length > 0) {
            await ChangeLog.deleteMany({ _id: { $in: changeLogIds } });
            console.log(`✅ Deleted ${changeLogIds.length} ChangeLogs created in May.`);
        } else {
            console.log(`✅ No ChangeLogs to delete.`);
        }

        // 3. Delete StaffProfiles created in May
        const allProfiles = await StaffProfile.find({});
        const profilesToDelete = allProfiles.filter(p => {
            const time = getNYTime(p.firstSeenAt || p.createdAt);
            return time.month === 5 && time.year === 2026;
        });
        const profileIds = profilesToDelete.map(p => p._id);

        if (profileIds.length > 0) {
            await StaffProfile.deleteMany({ _id: { $in: profileIds } });
            console.log(`✅ Deleted ${profileIds.length} StaffProfiles newly created in May.`);
        } else {
            console.log(`✅ No StaffProfiles to delete.`);
        }

        // 4. Revert StaffDirectory lastProcessedAt back to April
        const allDirs = await StaffDirectory.find({ isActive: true });
        let dirRevertCount = 0;
        
        for (const dir of allDirs) {
            if (dir.lastProcessedAt) {
                const time = getNYTime(dir.lastProcessedAt);
                if (time.month === 5 && time.year === 2026) {
                    // Set it to April 1st, 2026 (UTC is fine, we just need the month to be 4 in NY time)
                    dir.lastProcessedAt = new Date('2026-04-01T12:00:00Z');
                    await dir.save();
                    dirRevertCount++;
                }
            }
        }
        console.log(`✅ Reverted lastProcessedAt to April for ${dirRevertCount} StaffDirectories.`);

        // 5. Revert Site latestSnapshot
        const allSites = await Site.find({});
        let siteRevertCount = 0;
        
        for (const site of allSites) {
            const latestValidSnapshot = await Snapshot.findOne({ site: site._id })
                .sort({ snapshotDate: -1 });
                
            if (latestValidSnapshot) {
                if (!site.latestSnapshot || site.latestSnapshot.toString() !== latestValidSnapshot._id.toString()) {
                    site.latestSnapshot = latestValidSnapshot._id;
                    site.lastScrapedAt = latestValidSnapshot.snapshotDate;
                    await site.save();
                    siteRevertCount++;
                }
            } else {
                if (site.latestSnapshot) {
                    site.latestSnapshot = null;
                    site.lastScrapedAt = null;
                    await site.save();
                    siteRevertCount++;
                }
            }
        }
        console.log(`✅ Reverted latestSnapshot pointers for ${siteRevertCount} Sites.`);

        console.log(`\n🎉 Rollback Complete! The database is now perfectly primed to start a fresh scraping cycle for May when the app runs.`);

    } catch (error) {
        console.error("❌ Error during rollback:", error.message);
    } finally {
        await mongoose.disconnect();
    }
}

rollbackMayData();
