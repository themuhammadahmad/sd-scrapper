import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import ChangeLog from '../models/ChangeLog.js';
import Snapshot from '../models/Snapshot.js';

function findPersonInSnapshot(snapshot, fingerprint) {
    if (!snapshot || !snapshot.categories) return null;
    for (const cat of snapshot.categories) {
        if (!cat.members) continue;
        for (const member of cat.members) {
            if (member.fingerprint === fingerprint) return member;
        }
    }
    return null;
}

async function verifyChanges() {
    try {
        if (!process.env.MONGODB_URI) {
            console.error("❌ MONGODB_URI not found in .env file");
            process.exit(1);
        }

        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("✅ Connected.\n");

        console.log("Reading test.xlsx...");
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(path.join(__dirname, '..', 'test.xlsx'));
        const worksheet = workbook.worksheets[0];

        if (!worksheet) {
            console.error("❌ No worksheet found in test.xlsx");
            return;
        }

        const maxRowsToTest = 20;
        let testedCount = 0;

        console.log(`\n🔍 Verifying the first ${maxRowsToTest} changes...\n`);

        for (let i = 2; i <= worksheet.rowCount; i++) {
            if (testedCount >= maxRowsToTest) break;

            const row = worksheet.getRow(i);
            const changeType = row.getCell(1).value;
            const school = row.getCell(4).value;
            const uniqueId = row.getCell(5).value;
            const firstName = row.getCell(7).value;
            const lastName = row.getCell(8).value;
            const changeDetails = row.getCell(12).value;

            if (!uniqueId || !changeType) continue;

            testedCount++;
            const name = `${firstName || ''} ${lastName || ''}`.trim();

            console.log(`--------------------------------------------------`);
            console.log(`[Test ${testedCount}] ${school} - ${name} (${uniqueId})`);
            console.log(`Excel claims: Type '${changeType}', Details: ${changeDetails}`);

            // Find the most recent ChangeLog involving this fingerprint
            const log = await ChangeLog.findOne({
                $or: [
                    { "added.fingerprint": uniqueId },
                    { "removed.fingerprint": uniqueId },
                    { "updated.fingerprint": uniqueId }
                ]
            }).sort({ createdAt: -1 }).populate('fromSnapshot toSnapshot');

            if (!log) {
                console.log(`❌ FAILED: Could not find any ChangeLog in the database for fingerprint ${uniqueId}`);
                continue;
            }

            if (!log.fromSnapshot || !log.toSnapshot) {
                console.log(`❌ FAILED: ChangeLog found, but it is missing the actual from/to snapshot references.`);
                continue;
            }

            const personInFrom = findPersonInSnapshot(log.fromSnapshot, uniqueId);
            const personInTo = findPersonInSnapshot(log.toSnapshot, uniqueId);

            let passed = true;
            let reason = [];

            if (changeType === 'n') {
                // Expected: Not in FROM, Yes in TO
                if (personInFrom) { passed = false; reason.push(`Found person in the older April snapshot! They are not "New".`); }
                if (!personInTo) { passed = false; reason.push(`Could not find person in the newer May snapshot!`); }
                
                if (passed) console.log(`✅ VERIFIED: Correctly identified as ADDED. (Verified missing in old snapshot, found in new snapshot)`);
            } 
            else if (changeType === 'r') {
                // Expected: Yes in FROM, Not in TO
                if (!personInFrom) { passed = false; reason.push(`Could not find person in the older April snapshot!`); }
                if (personInTo) { passed = false; reason.push(`Found person in the newer May snapshot! They are not "Removed".`); }

                if (passed) console.log(`✅ VERIFIED: Correctly identified as REMOVED. (Verified present in old snapshot, missing in new snapshot)`);
            } 
            else {
                // It's an update (j, e, #, a, etc)
                // Expected: Yes in FROM, Yes in TO
                if (!personInFrom) { passed = false; reason.push(`Could not find person in the older April snapshot!`); }
                if (!personInTo) { passed = false; reason.push(`Could not find person in the newer May snapshot!`); }

                if (passed) {
                    console.log(`✅ VERIFIED: Correctly identified as UPDATED. Person successfully found in BOTH snapshots.`);
                    // We can also print out what the DB actually holds to show the user
                    console.log(`   -> April title: ${personInFrom.title || 'N/A'}, May title: ${personInTo.title || 'N/A'}`);
                    console.log(`   -> April email: ${personInFrom.emails?.join(', ') || 'N/A'}, May email: ${personInTo.emails?.join(', ') || 'N/A'}`);
                }
            }

            if (!passed) {
                console.log(`❌ VERIFICATION FAILED:`);
                reason.forEach(r => console.log(`   - ${r}`));
            }
        }

        console.log(`\n🎉 Verification complete. Tested ${testedCount} changes.\n`);

    } catch (error) {
        console.error("❌ Error running verification:", error.message);
    } finally {
        await mongoose.disconnect();
    }
}

verifyChanges();
