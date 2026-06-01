// test-compare.js
import mongoose from 'mongoose';
import Snapshot from './models/Snapshot.js';
import Site from './models/Site.js';
import { compareSnapshotsFuzzy } from './utils/diffEngine.js';

// ===== CONFIGURE THESE VARIABLES =====
const SCHOOL_NAME = 'Fairleigh Dickinson University-Florham Campus';
const STAFF_DIRECTORY_URL = 'https://fdudevils.com/staff-directory';
// =====================================

const MONGODB_URI = "mongodb+srv://learnFirstAdmin:mT4aOUQ8IeZlGqf6@khareedofrokht.h4nje.mongodb.net/universities?retryWrites=true&w=majority&appName=khareedofrokht";

/**
 * Creates a deep copy of a snapshot
 */
function deepCopySnapshot(snapshot) {
    return JSON.parse(JSON.stringify(snapshot));
}

/**
 * Changes the spelling of a person's name
 * @param {Object} snapshot - Original snapshot
 * @param {string} currentName - Current name to find
 * @param {string} newName - New name with changed spelling
 * @returns {Object} Modified snapshot
 */
function changePersonName(snapshot, currentName, newName) {
    const modified = deepCopySnapshot(snapshot);
    let found = false;
    let categoriesFound = [];
    
    // Find and update the person in all categories they appear
    for (const cat of modified.categories) {
        for (const member of cat.members) {
            if (member.name === currentName) {
                const oldName = member.name;
                member.name = newName;
                found = true;
                categoriesFound.push(cat.name);
                
                // Also update raw data if it exists
                if (member.raw && member.raw.name) {
                    member.raw.name = newName;
                }
            }
        }
    }
    
    if (!found) {
        console.log(`   ⚠️  Could not find person with name: "${currentName}"`);
        return null;
    }
    
    console.log(`   Changed name from "${currentName}" to "${newName}"`);
    console.log(`   Person appears in categories: ${categoriesFound.join(', ')}`);
    
    return modified;
}

/**
 * Calculates string similarity for comparison
 */
function getSimilarity(s1, s2) {
    if (!s1 || !s2) return 0;
    s1 = s1.toLowerCase().trim();
    s2 = s2.toLowerCase().trim();
    if (s1 === s2) return 1.0;
    
    const len1 = s1.length;
    const len2 = s2.length;
    const matrix = Array.from({ length: len1 + 1 }, () => Array(len2 + 1).fill(0));

    for (let i = 0; i <= len1; i++) matrix[i][0] = i;
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;

    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }
    return 1.0 - matrix[len1][len2] / Math.max(len1, len2);
}

async function main() {
    try {
        // Connect to MongoDB
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI, {
            tls: true,
            tlsAllowInvalidCertificates: true,
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 45000,
            maxPoolSize: 10,
            minPoolSize: 2,
            heartbeatFrequencyMS: 10000,
            retryWrites: true,
            retryReads: true
        });
        console.log('✅ Connected to MongoDB Atlas\n');

        // Find the site
        let site = await Site.findOne({ 
            $or: [
                { baseUrl: STAFF_DIRECTORY_URL },
                { staffDirectory: STAFF_DIRECTORY_URL },
                { schoolName: SCHOOL_NAME }
            ]
        });

        if (!site) {
            console.log(`❌ Site not found`);
            const allSites = await Site.find({}, 'schoolName baseUrl staffDirectory').limit(10);
            allSites.forEach(s => {
                console.log(`   - ${s.schoolName || 'No name'} | ${s.baseUrl || s.staffDirectory}`);
            });
            await mongoose.disconnect();
            return;
        }

        console.log(`🎯 Found site: ${site.schoolName || site.baseUrl}\n`);

        // Get the latest snapshot
        const latestSnapshot = await Snapshot.findOne({ site: site._id })
            .sort({ snapshotDate: -1 })
            .lean();

        if (!latestSnapshot) {
            console.log(`❌ No snapshots found`);
            await mongoose.disconnect();
            return;
        }

        console.log(`📸 Latest snapshot:`);
        console.log(`   Date: ${latestSnapshot.snapshotDate}`);
        console.log(`   Total staff: ${latestSnapshot.totalCount}`);
        console.log(`   Categories: ${latestSnapshot.categories?.length || 0}\n`);

        // ===== TEST 1: Find Kristin Giotta =====
        console.log('═══════════════════════════════════════════════════════════');
        console.log('TEST 1: Finding "Kristin Giotta" in the snapshot');
        console.log('═══════════════════════════════════════════════════════════');
        
        let kristinData = null;
        for (const cat of latestSnapshot.categories) {
            const found = cat.members.find(m => m.name === 'Kristin Giotta');
            if (found) {
                kristinData = {
                    person: found,
                    category: cat.name,
                    title: found.title,
                    email: found.emails?.[0],
                    fingerprint: found.fingerprint
                };
                break;
            }
        }
        
        if (!kristinData) {
            console.log('\n❌ Could not find "Kristin Giotta" in the snapshot!');
            console.log('   Available staff members (first 20):\n');
            let count = 0;
            for (const cat of latestSnapshot.categories) {
                for (const member of cat.members) {
                    if (count < 20) {
                        console.log(`   - ${member.name} (${cat.name})`);
                        count++;
                    } else break;
                }
                if (count >= 20) break;
            }
            await mongoose.disconnect();
            return;
        }
        
        console.log(`\n✅ Found Kristin Giotta:`);
        console.log(`   Name: ${kristinData.person.name}`);
        console.log(`   Title: ${kristinData.title}`);
        console.log(`   Email: ${kristinData.email}`);
        console.log(`   Category: ${kristinData.category}`);
        console.log(`   Fingerprint: ${kristinData.fingerprint}\n`);
        
        // ===== TEST 2: Baseline comparison (same snapshot) =====
        console.log('═══════════════════════════════════════════════════════════');
        console.log('TEST 2: Baseline - Same snapshot comparison');
        console.log('═══════════════════════════════════════════════════════════');
        
        const { added: sameAdded, removed: sameRemoved, updated: sameUpdated } = compareSnapshotsFuzzy(latestSnapshot, latestSnapshot);
        
        console.log('📊 RESULTS:');
        console.log(`   ✅ Added: ${sameAdded.length}`);
        console.log(`   ❌ Removed: ${sameRemoved.length}`);
        console.log(`   📝 Updated: ${sameUpdated.length}`);
        
        if (sameAdded.length === 0 && sameRemoved.length === 0 && sameUpdated.length === 0) {
            console.log('   ✨ PASS: Baseline test shows no changes\n');
        } else {
            console.log('   ⚠️  FAIL: Baseline test shows unexpected changes!\n');
        }
        
        // ===== TEST 3: Test different name spelling variations =====
        console.log('═══════════════════════════════════════════════════════════');
        console.log('TEST 3: Testing name spelling changes');
        console.log('═══════════════════════════════════════════════════════════');
        
        const variations = [
            { name: 'Kristin Giotta', variation: 'Kristen Giotta', description: 'Minor spelling change (Kristin → Kristen)' },
            { name: 'Kristin Giotta', variation: 'Kristin Giota', description: 'Missing letter (Giotta → Giota)' },
            { name: 'Kristin Giotta', variation: 'Kristin Giotto', description: 'Letter change (Giotta → Giotto)' },
            { name: 'Kristin Giotta', variation: 'K. Giotta', description: 'Initials format' },
            { name: 'Kristin Giotta', variation: 'Kristin Anne Giotta', description: 'Added middle name' },
            { name: 'Kristin Giotta', variation: 'Dr. Kristin Giotta', description: 'Added title prefix' }
        ];
        
        for (const variation of variations) {
            console.log(`\n--- Test: ${variation.description} ---`);
            console.log(`   Changing: "${variation.name}" → "${variation.variation}"`);
            
            const modifiedSnapshot = changePersonName(latestSnapshot, variation.name, variation.variation);
            
            if (!modifiedSnapshot) {
                console.log(`   ❌ Failed to create modified snapshot\n`);
                continue;
            }
            
            // Compare original with modified
            const { added, removed, updated } = compareSnapshotsFuzzy(latestSnapshot, modifiedSnapshot);
            
            console.log(`\n   📊 Results:`);
            console.log(`      Added: ${added.length}, Removed: ${removed.length}, Updated: ${updated.length}`);
            
            // Check if Kristin was detected
            let kristinDetected = false;
            let detectionType = null;
            
            // Check in updated
            for (const item of updated) {
                if (item.after.name === variation.variation || item.before.name === variation.name) {
                    kristinDetected = true;
                    detectionType = 'UPDATED';
                    const nameSimilarity = getSimilarity(item.before.name, item.after.name);
                    console.log(`      ✅ DETECTED as UPDATE!`);
                    console.log(`         Name similarity: ${(nameSimilarity * 100).toFixed(1)}%`);
                    if (item.diffs.name) {
                        console.log(`         Name change: "${item.diffs.name.before}" → "${item.diffs.name.after}"`);
                    }
                    break;
                }
            }
            
            // Check in added (wrong)
            if (!kristinDetected) {
                for (const item of added) {
                    if (item.name === variation.variation) {
                        kristinDetected = true;
                        detectionType = 'ADDED (WRONG - should be UPDATE)';
                        console.log(`      ❌ DETECTED as ADDED (should be UPDATE)`);
                        console.log(`         Person appears as new instead of modified`);
                        break;
                    }
                }
            }
            
            // Check in removed (wrong)
            if (!kristinDetected) {
                for (const item of removed) {
                    if (item.name === variation.name) {
                        kristinDetected = true;
                        detectionType = 'REMOVED (WRONG - should be UPDATE)';
                        console.log(`      ❌ DETECTED as REMOVED (should be UPDATE)`);
                        console.log(`         Person appears as deleted instead of modified`);
                        break;
                    }
                }
            }
            
            if (!kristinDetected) {
                console.log(`      ❌ NOT DETECTED at all!`);
                console.log(`         The diff engine failed to detect this name change`);
                
                // Calculate similarity to show why
                const similarity = getSimilarity(variation.name, variation.variation);
                console.log(`         String similarity: ${(similarity * 100).toFixed(1)}%`);
                console.log(`         (Threshold for fuzzy matching is 85%)`);
                
                if (similarity >= 0.85) {
                    console.log(`         ⚠️  Similarity is >=85% but still not detected!`);
                } else {
                    console.log(`         ℹ️  Similarity below 85% threshold, would need exact match or email/URL`);
                }
            }
        }
        
        // ===== TEST 4: Test with email preservation (should still match) =====
        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('TEST 4: Extreme name change but same email');
        console.log('═══════════════════════════════════════════════════════════');
        
        if (kristinData.email) {
            console.log(`\n   Keeping email: ${kristinData.email}`);
            console.log(`   Changing name to: "Jane Smith (Formerly Kristin Giotta)"`);
            
            const modifiedSnapshot = changePersonName(latestSnapshot, 'Kristin Giotta', 'Jane Smith (Formerly Kristin Giotta)');
            
            if (modifiedSnapshot) {
                const { added, removed, updated } = compareSnapshotsFuzzy(latestSnapshot, modifiedSnapshot);
                
                console.log(`\n   📊 Results:`);
                console.log(`      Added: ${added.length}, Removed: ${removed.length}, Updated: ${updated.length}`);
                
                let found = false;
                for (const item of updated) {
                    if (item.after.emails?.includes(kristinData.email) || item.before.emails?.includes(kristinData.email)) {
                        found = true;
                        console.log(`      ✅ DETECTED as UPDATE via email matching!`);
                        console.log(`         Even though name changed completely, email kept them linked`);
                        if (item.diffs.name) {
                            console.log(`         Name change detected: "${item.diffs.name.before}" → "${item.diffs.name.after}"`);
                        }
                        break;
                    }
                }
                
                if (!found) {
                    console.log(`      ❌ NOT DETECTED - Email matching failed!`);
                }
            }
        } else {
            console.log(`\n   ⚠️  Kristin Giotta has no email in snapshot, skipping email test`);
        }
        
        // ===== TEST 5: Show actual diff engine behavior for a real name change =====
        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('TEST 5: Real-world simulation - Minor typo');
        console.log('═══════════════════════════════════════════════════════════');
        
        const typoVariation = { name: 'Kristin Giotta', variation: 'Kristin Giota', description: 'Common typo (missing one t)' };
        console.log(`\n   Simulating: ${typoVariation.description}`);
        
        const modifiedWithTypo = changePersonName(latestSnapshot, typoVariation.name, typoVariation.variation);
        
        if (modifiedWithTypo) {
            const { added, removed, updated } = compareSnapshotsFuzzy(latestSnapshot, modifiedWithTypo);
            
            console.log(`\n   🔍 Detailed analysis:`);
            
            if (updated.length > 0) {
                const kristinUpdate = updated.find(u => 
                    u.after.name === typoVariation.variation || 
                    u.before.name === typoVariation.name
                );
                
                if (kristinUpdate) {
                    console.log(`   ✅ Kristin Giotta correctly identified as UPDATED`);
                    console.log(`\n   📝 Change details:`);
                    if (kristinUpdate.diffs.name) {
                        console.log(`      Name: "${kristinUpdate.diffs.name.before}" → "${kristinUpdate.diffs.name.after}"`);
                    }
                    if (kristinUpdate.diffs.title) {
                        console.log(`      Title changed`);
                    }
                    if (kristinUpdate.diffs.categories) {
                        console.log(`      Categories changed`);
                    }
                    
                    const similarity = getSimilarity(kristinUpdate.before.name, kristinUpdate.after.name);
                    console.log(`\n   📊 Matching confidence:`);
                    console.log(`      Name similarity: ${(similarity * 100).toFixed(1)}%`);
                    console.log(`      Threshold: 85%`);
                    console.log(`      Result: ${similarity >= 0.85 ? 'MATCHED (within threshold)' : 'Would not match without email/URL'}`);
                }
            } else if (added.length > 0) {
                const kristinAdded = added.find(a => a.name === typoVariation.variation);
                if (kristinAdded) {
                    console.log(`   ❌ Kristin appears as ADDED (new person)`);
                    console.log(`   ❌ Original Kristin appears as REMOVED (old person gone)`);
                    console.log(`   This means the matching algorithm failed to link them`);
                }
            } else {
                console.log(`   ❌ No changes detected at all!`);
            }
        }

        await mongoose.disconnect();
        console.log('\n👋 Disconnected from MongoDB');

    } catch (error) {
        console.error('❌ Error:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
}

// Handle process termination
process.on('SIGINT', async () => {
    console.log('\n🛑 Interrupted. Disconnecting...');
    await mongoose.disconnect();
    process.exit(0);
});

main();