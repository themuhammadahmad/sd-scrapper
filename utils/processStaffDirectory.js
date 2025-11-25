/**
 * Process one staffDirectory URL
 */

// Parsers
import { runParsers } from "../parsers/registry.js";
import puppeteerParser from "../fallback/puppeteerParser.js";
import fetch from "node-fetch";

import Site from "../models/Site.js";
import Snapshot from "../models/Snapshot.js";
import FailedDirectory from "../models/FailedDirectory.js";
import StaffProfile from "../models/StaffProfile.js";
import ChangeLog from "../models/ChangeLog.js";
import crypto from "crypto";
let sadf = "with pupeteer ✅";
export default async function processStaffDirectory(baseUrl, staffDirectory) {
  let html = null;
  let fetchFailed = false;
  let usedPuppeteer = false;
  let hasData = false;

  try {
    const res = await fetch(staffDirectory);
    
    if (!res.ok) {
      console.log(`⚠️ HTTP ${res.status} for ${staffDirectory}, trying puppeteer...`);
      throw new Error(`HTTP ${res.status}`);
    }
    
    html = await res.text();
    console.log(`✅ Fetch successful for ${staffDirectory}`);
  } catch (e) {
    console.log(`⚠️ Fetch failed for ${staffDirectory}, trying puppeteer...`);
    fetchFailed = true;
    try {
      console.log("🔄 Using puppeteer due to fetch failure...");
      html = await fetch(staffDirectory);
      fetchFailed = false;
      usedPuppeteer = false;
    } catch (puppeteerError) {
      // Both fetch and puppeteer failed
      await FailedDirectory.findOneAndUpdate(
        { staffDirectory },
        {
          baseUrl,
          staffDirectory,
          failureType: 'fetch_failed',
          errorMessage: `Fetch: ${e.message}, Puppeteer: ${puppeteerError.message}`,
          lastAttempt: new Date(),
          $inc: { attemptCount: 1 }
        },
        { upsert: true, new: true }
      );
      throw new Error(`Complete fetch failure for ${staffDirectory}`);
    }
  }

  // First attempt with the HTML we have
  let parsedStaff = await runParsers(html, staffDirectory);

  // If fetch succeeded but no data was extracted, try with puppeteer
  if (!fetchFailed && (!parsedStaff.staff || parsedStaff.staff.length === 0)) {
    console.log(`⚠️ Fetch succeeded but no data extracted from ${staffDirectory}, trying puppeteer...`);
    try {
      console.log("🔄 Using puppeteer due to no data from fetch...");
      const puppeteerHtml = await puppeteerParser(staffDirectory);
      usedPuppeteer = true;
      
      // Try parsing again with puppeteer HTML
      parsedStaff = await runParsers(puppeteerHtml, staffDirectory);
      html = puppeteerHtml; // Update html for snapshot creation
      
      if (parsedStaff.staff && parsedStaff.staff.length > 0) {
        console.log(`✅ Puppeteer successfully extracted ${parsedStaff.staff.length} staff members`);
      } else {
        console.log(`❌ Puppeteer also failed to extract data from ${staffDirectory}`);
      }
    } catch (puppeteerError) {
      console.log(`❌ Puppeteer also failed: ${puppeteerError.message}`);
      // Continue with original parsedStaff (empty data)
    }
  }

  // Check if we got any staff data after all attempts
  if (!parsedStaff.staff || parsedStaff.staff.length === 0) {
    // Save to failed directories collection
    await FailedDirectory.findOneAndUpdate(
      { staffDirectory },
      {
        baseUrl,
        staffDirectory,
        failureType: fetchFailed ? 'fetch_failed' : 'no_data',
        errorMessage: fetchFailed ? 'Fetch required puppeteer fallback' : `No staff data extracted (used puppeteer: ${usedPuppeteer})`,
        htmlContent: html ? html.substring(0, 5000) : null,
        lastAttempt: new Date(),
        $inc: { attemptCount: 1 }
      },
      { upsert: true, new: true }
    );

    console.log(`⚠️ No staff data extracted from ${staffDirectory} after ${usedPuppeteer ? 'puppeteer' : 'fetch'} attempt, added to failed directories`);

    // Return early - NO SNAPSHOT CREATION
    return {
      snapshot: null,
      success: false,
      staffCount: 0,
      usedPuppeteer
    };
  }

  hasData = true;

  // NEW: Remove from FailedDirectory if this URL was previously marked as failed
  await FailedDirectory.findOneAndDelete({ staffDirectory });
  console.log(`✅ Successfully processed ${staffDirectory} (used puppeteer: ${usedPuppeteer}), removed from failed directories if previously present`);

  // ONLY CREATE SNAPSHOT IF WE HAVE DATA
  // 1. Find or create Site
  let site = await Site.findOne({ baseUrl });
  if (!site) {
    site = await Site.create({
      baseUrl,
      staffDirectory,
      metadata: {},
      lastScrapedAt: new Date(),
    });
  }

  // 2. Build categories for Snapshot
  const categoriesMap = new Map();

  parsedStaff.staff.forEach(person => {
    const categoryName = person.category || "default";
    if (!categoriesMap.has(categoryName)) {
      categoriesMap.set(categoryName, []);
    }
    
    categoriesMap.get(categoryName).push(person);
  });

  // Convert map to categories array
  const categories = Array.from(categoriesMap.entries()).map(([name, members]) => ({
    name,
    members: members.map(person => ({
      fingerprint: createPersonFingerprint(person), // USE CORRECT FINGERPRINT
      name: person.name,
      title: person.title,
      emails: person.email ? [person.email] : [],
      phones: person.phone ? [person.phone] : [],
      category: person.category,
      raw: person,
      extractedAt: new Date(),
    })),
    count: members.length,
  }));

  // 3. Create Snapshot
  const snapshot = await Snapshot.create({
    site: site._id,
    snapshotDate: new Date(),
    runId: Date.now().toString(),
    hash: crypto.createHash("md5").update(html).digest("hex"),
    categories,
    totalCount: categories.reduce((sum, cat) => sum + cat.count, 0),
    usedPuppeteer // Track if puppeteer was used for this snapshot
  });

  // 4. Upsert StaffProfiles
  for (const category of categories) {
    for (const member of category.members) {
      await StaffProfile.findOneAndUpdate(
        { fingerprint: member.fingerprint },
        {
          site: site._id,
          profileUrl: member.profileUrl,
          canonicalName: member.name,
          emails: member.emails,
          phones: member.phones,
          lastSeenAt: new Date(),
          lastSnapshot: snapshot._id,
          raw: member.raw,
          ...(member.firstSeenAt ? {} : { firstSeenAt: new Date() }),
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true
        }
      );
    }
  }

  // 5. Compare with last snapshot → log changes
  let previousSnapshot = null;
  if (site.latestSnapshot) {
    previousSnapshot = await Snapshot.findById(site.latestSnapshot);
    if (previousSnapshot) {
      // Use the profile-based change detection
      const changes = await detectChangesUsingSnapshotMembers(previousSnapshot, snapshot, site._id);
      // Add this right after the changes detection
      console.log(`🔍 Change detection results:`, {
        added: changes.added.length,
        removed: changes.removed.length,
        updated: changes.updated.length,
        hasChanges: changes.added.length > 0 || changes.removed.length > 0 || changes.updated.length > 0
      });
      if (changes.added.length > 0 || changes.removed.length > 0 || changes.updated.length > 0) {
        await ChangeLog.create({
          site: site._id,
          fromSnapshot: previousSnapshot._id,
          toSnapshot: snapshot._id,
          added: changes.added,
          removed: changes.removed,
          updated: changes.updated,
        });

        console.log(`📝 ChangeLog created: ${changes.added.length} added, ${changes.removed.length} removed, ${changes.updated.length} updated`);
      } else {
        console.log('✅ No changes detected since last snapshot');
      }
    }
  }

  // 6. UPDATE: Clean up old snapshots - Keep only latest 2
  await cleanupOldSnapshots(site._id, snapshot._id);

  // 7. Update Site metadata
  site.latestSnapshot = snapshot._id;
  site.lastScrapedAt = new Date();
  await site.save();

  return {
    snapshot,
    success: true,
    staffCount: parsedStaff.staff.length,
    usedPuppeteer
  };
}
sadf = "no pupeteer ❌";
// export default async function processStaffDirectory(baseUrl, staffDirectory) {
//   let html = null;
//   let fetchFailed = false;
//   let usedPuppeteer = false;
//   let hasData = false;

//   try {
//     const res = await fetch(staffDirectory);
    
//     if (!res.ok) {
//       console.log(`⚠️ HTTP ${res.status} for ${staffDirectory}`);
//       // Commented out Puppeteer fallback
//       // console.log(`⚠️ HTTP ${res.status} for ${staffDirectory}, trying puppeteer...`);
//       // throw new Error(`HTTP ${res.status}`);
      
//       // Instead of throwing, just mark as failed and continue
//       fetchFailed = true;
//       throw new Error(`HTTP ${res.status} - Fetch failed`);
//     }
    
//     html = await res.text();
//     console.log(`✅ Fetch successful for ${staffDirectory}`);
//   } catch (e) {
//     console.log(`⚠️ Fetch failed for ${staffDirectory}`);
//     fetchFailed = true;
    
//     // Commented out Puppeteer fallback
//     /*
//     try {
//       console.log("🔄 Using puppeteer due to fetch failure...");
//       html = await puppeteerParser(staffDirectory);
//       usedPuppeteer = true;
//     } catch (puppeteerError) {
//       // Both fetch and puppeteer failed
//       await FailedDirectory.findOneAndUpdate(
//         { staffDirectory },
//         {
//           baseUrl,
//           staffDirectory,
//           failureType: 'fetch_failed',
//           errorMessage: `Fetch: ${e.message}, Puppeteer: ${puppeteerError.message}`,
//           lastAttempt: new Date(),
//           $inc: { attemptCount: 1 }
//         },
//         { upsert: true, new: true }
//       );
//       throw new Error(`Complete fetch failure for ${staffDirectory}`);
//     }
//     */
    
//     // Just save to failed directories without Puppeteer attempt
//     await FailedDirectory.findOneAndUpdate(
//       { staffDirectory },
//       {
//         baseUrl,
//         staffDirectory,
//         failureType: 'fetch_failed',
//         errorMessage: `Fetch failed: ${e.message}`,
//         lastAttempt: new Date(),
//         $inc: { attemptCount: 1 }
//       },
//       { upsert: true, new: true }
//     );
//     throw new Error(`Fetch failed for ${staffDirectory}`);
//   }

//   // First attempt with the HTML we have
//   let parsedStaff = await runParsers(html, staffDirectory);

//   // Commented out Puppeteer fallback for no data
//   /*
//   // If fetch succeeded but no data was extracted, try with puppeteer
//   if (!fetchFailed && (!parsedStaff.staff || parsedStaff.staff.length === 0)) {
//     console.log(`⚠️ Fetch succeeded but no data extracted from ${staffDirectory}, trying puppeteer...`);
//     try {
//       console.log("🔄 Using puppeteer due to no data from fetch...");
//       const puppeteerHtml = await puppeteerParser(staffDirectory);
//       usedPuppeteer = true;
      
//       // Try parsing again with puppeteer HTML
//       parsedStaff = await runParsers(puppeteerHtml, staffDirectory);
//       html = puppeteerHtml; // Update html for snapshot creation
      
//       if (parsedStaff.staff && parsedStaff.staff.length > 0) {
//         console.log(`✅ Puppeteer successfully extracted ${parsedStaff.staff.length} staff members`);
//       } else {
//         console.log(`❌ Puppeteer also failed to extract data from ${staffDirectory}`);
//       }
//     } catch (puppeteerError) {
//       console.log(`❌ Puppeteer also failed: ${puppeteerError.message}`);
//       // Continue with original parsedStaff (empty data)
//     }
//   }
//   */
//   // Check if we got any staff data after all attempts
//   if (!parsedStaff.staff || parsedStaff.staff.length === 0) {
//     // Save to failed directories collection
//     await FailedDirectory.findOneAndUpdate(
//       { staffDirectory },
//       {
//         baseUrl,
//         staffDirectory,
//         failureType: fetchFailed ? 'fetch_failed' : 'no_data',
//         errorMessage: fetchFailed ? 'Fetch required puppeteer fallback' : `No staff data extracted (used puppeteer: ${usedPuppeteer})`,
//         htmlContent: html ? html.substring(0, 5000) : null,
//         lastAttempt: new Date(),
//         $inc: { attemptCount: 1 }
//       },
//       { upsert: true, new: true }
//     );

//     console.log(`⚠️ No staff data extracted from ${staffDirectory} after ${usedPuppeteer ? 'puppeteer' : 'fetch'} attempt, added to failed directories`);

//     // Return early - NO SNAPSHOT CREATION
//     return {
//       snapshot: null,
//       success: false,
//       staffCount: 0,
//       usedPuppeteer
//     };
//   }

//   hasData = true;

//   // NEW: Remove from FailedDirectory if this URL was previously marked as failed
//   await FailedDirectory.findOneAndDelete({ staffDirectory });
//   console.log(`✅ Successfully processed ${staffDirectory} (used puppeteer: ${usedPuppeteer}), removed from failed directories if previously present`);

//   // ONLY CREATE SNAPSHOT IF WE HAVE DATA
//   // 1. Find or create Site
//   let site = await Site.findOne({ baseUrl });
//   if (!site) {
//     site = await Site.create({
//       baseUrl,
//       staffDirectory,
//       metadata: {},
//       lastScrapedAt: new Date(),
//     });
//   }

//   // 2. Build categories for Snapshot
//   const categoriesMap = new Map();

//   parsedStaff.staff.forEach(person => {
//     const categoryName = person.category || "default";
//     if (!categoriesMap.has(categoryName)) {
//       categoriesMap.set(categoryName, []);
//     }
    
//     categoriesMap.get(categoryName).push(person);
//   });

//   // Convert map to categories array
//   const categories = Array.from(categoriesMap.entries()).map(([name, members]) => ({
//     name,
//     members: members.map(person => ({
//       fingerprint: createPersonFingerprint(person), // USE CORRECT FINGERPRINT
//       name: person.name,
//       title: person.title,
//       emails: person.email ? [person.email] : [],
//       phones: person.phone ? [person.phone] : [],
//       category: person.category,
//       raw: person,
//       extractedAt: new Date(),
//     })),
//     count: members.length,
//   }));

//   // 3. Create Snapshot
//   const snapshot = await Snapshot.create({
//     site: site._id,
//     snapshotDate: new Date(),
//     runId: Date.now().toString(),
//     hash: crypto.createHash("md5").update(html).digest("hex"),
//     categories,
//     totalCount: categories.reduce((sum, cat) => sum + cat.count, 0),
//     usedPuppeteer // Track if puppeteer was used for this snapshot
//   });

//   // 4. Upsert StaffProfiles
//   for (const category of categories) {
//     for (const member of category.members) {
//       await StaffProfile.findOneAndUpdate(
//         { fingerprint: member.fingerprint },
//         {
//           site: site._id,
//           profileUrl: member.profileUrl,
//           canonicalName: member.name,
//           emails: member.emails,
//           phones: member.phones,
//           lastSeenAt: new Date(),
//           lastSnapshot: snapshot._id,
//           raw: member.raw,
//           ...(member.firstSeenAt ? {} : { firstSeenAt: new Date() }),
//         },
//         {
//           upsert: true,
//           new: true,
//           setDefaultsOnInsert: true
//         }
//       );
//     }
//   }

//   // 5. Compare with last snapshot → log changes
//   let previousSnapshot = null;
//   if (site.latestSnapshot) {
//     previousSnapshot = await Snapshot.findById(site.latestSnapshot);
//     if (previousSnapshot) {
//       // Use the profile-based change detection
//       const changes = await detectChangesUsingSnapshotMembers(previousSnapshot, snapshot, site._id);
//       // Add this right after the changes detection
//       console.log(`🔍 Change detection results:`, {
//         added: changes.added.length,
//         removed: changes.removed.length,
//         updated: changes.updated.length,
//         hasChanges: changes.added.length > 0 || changes.removed.length > 0 || changes.updated.length > 0
//       });
//       if (changes.added.length > 0 || changes.removed.length > 0 || changes.updated.length > 0) {
//         await ChangeLog.create({
//           site: site._id,
//           fromSnapshot: previousSnapshot._id,
//           toSnapshot: snapshot._id,
//           added: changes.added,
//           removed: changes.removed,
//           updated: changes.updated,
//         });

//         console.log(`📝 ChangeLog created: ${changes.added.length} added, ${changes.removed.length} removed, ${changes.updated.length} updated`);
//       } else {
//         console.log('✅ No changes detected since last snapshot');
//       }
//     }
//   }

//   // 6. UPDATE: Clean up old snapshots - Keep only latest 2
//   await cleanupOldSnapshots(site._id, snapshot._id);

//   // 7. Update Site metadata
//   site.latestSnapshot = snapshot._id;
//   site.lastScrapedAt = new Date();
//   await site.save();

//   return {
//     snapshot,
//     success: true,
//     staffCount: parsedStaff.staff.length,
//     usedPuppeteer
//   };
// }

async function detectChangesUsingSnapshotMembers(prevSnapshot, currentSnapshot, siteId) {
  const changes = {
    added: [],
    removed: [],
    updated: []
  };

  // Build person maps with their categories
  const prevPeople = buildPersonMapWithCategories(prevSnapshot);
  const currentPeople = buildPersonMapWithCategories(currentSnapshot);

  // Find additions (people in current but not in previous)
  for (const [fingerprint, currentPerson] of currentPeople) {
    if (!prevPeople.has(fingerprint)) {
      changes.added.push({
        fingerprint,
        name: currentPerson.name,
        categories: currentPerson.categories,
        data: currentPerson.data
      });
    }
  }

  // Find removals (people in previous but not in current)  
  for (const [fingerprint, prevPerson] of prevPeople) {
    if (!currentPeople.has(fingerprint)) {
      changes.removed.push({
        fingerprint,
        name: prevPerson.name,
        categories: prevPerson.categories,
        data: prevPerson.data
      });
    }
  }

  // Find updates (people in both but with changes)
  for (const [fingerprint, currentPerson] of currentPeople) {
    const prevPerson = prevPeople.get(fingerprint);
    if (prevPerson) {
      const personChanges = comparePersonWithCategories(prevPerson, currentPerson);
      if (personChanges.hasChanges) {
        changes.updated.push(personChanges);
      }
    }
  }

  return changes;
}
export { detectChangesUsingSnapshotMembers }

function buildPersonMapWithCategories(snapshot) {
  const peopleMap = new Map();

  snapshot.categories.forEach(category => {
    category.members.forEach(member => {
      if (!peopleMap.has(member.fingerprint)) {
        // First time seeing this person
        peopleMap.set(member.fingerprint, {
          fingerprint: member.fingerprint,
          name: member.name,
          categories: new Set([category.name]),
          data: member // Store one instance of their data
        });
      } else {
        // Person already exists, just add this category
        peopleMap.get(member.fingerprint).categories.add(category.name);
      }
    });
  });

  // Convert Sets to Arrays for easier comparison
  for (const person of peopleMap.values()) {
    person.categories = Array.from(person.categories).sort();
  }

  return peopleMap;
}

function comparePersonWithCategories(prevPerson, currentPerson) {
  const diffs = {};
  let hasChanges = false;

  // Compare basic fields
  const fields = ['name', 'title', 'emails', 'phones', 'profileUrl'];
  fields.forEach(field => {
    if (!deepEqual(prevPerson.data[field], currentPerson.data[field])) {
      diffs[field] = {
        before: prevPerson.data[field],
        after: currentPerson.data[field]
      };
      hasChanges = true;
    }
  });

  // Compare categories (even if no other fields changed)
  if (!deepEqual(prevPerson.categories, currentPerson.categories)) {
    diffs.categories = {
      before: prevPerson.categories,
      after: currentPerson.categories
    };
    hasChanges = true;
  }

  return {
    fingerprint: currentPerson.fingerprint,
    name: currentPerson.name,
    before: prevPerson,
    after: currentPerson,
    diffs: Object.keys(diffs).length > 0 ? diffs : null,
    hasChanges
  };
}



function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    return areArraysEqual(a, b);
  }

  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function areArraysEqual(arr1, arr2) {
  if (!arr1 && !arr2) return true;
  if (!arr1 || !arr2) return false;
  if (arr1.length !== arr2.length) return false;

  const sorted1 = [...arr1].map(item => String(item).trim().toLowerCase()).sort();
  const sorted2 = [...arr2].map(item => String(item).trim().toLowerCase()).sort();

  return sorted1.every((item, index) => item === sorted2[index]);
}
function createPersonFingerprint(person) {
  // Use ONLY email for fingerprint (most stable identifier)
  const email = (person.email || '').toLowerCase().trim();

  if (!email) {
    // Fallback: if no email, use name (less reliable)
    return crypto.createHash("md5")
      .update((person.name || '').toLowerCase().trim())
      .digest("hex");
  }

  return crypto.createHash("md5")
    .update(email)
    .digest("hex");
}


// NEW FUNCTION: Clean up old snapshots, keep only latest 2
async function cleanupOldSnapshots(siteId, currentSnapshotId) {
  try {
    // Find all snapshots for this site, sorted by date (newest first)
    const allSnapshots = await Snapshot.find({ site: siteId })
      .sort({ snapshotDate: -1 })
      .select('_id snapshotDate')
      .lean();

    // If we have more than 2 snapshots, delete the older ones
    if (allSnapshots.length > 2) {
      const snapshotsToDelete = allSnapshots.slice(2); // Keep first 2, delete the rest

      console.log(`🗑️ Cleaning up ${snapshotsToDelete.length} old snapshots for site ${siteId}`);

      for (const oldSnapshot of snapshotsToDelete) {
        // Also clean up any ChangeLog entries that reference the deleted snapshots
        await ChangeLog.deleteMany({
          $or: [
            { fromSnapshot: oldSnapshot._id },
            { toSnapshot: oldSnapshot._id }
          ]
        });

        // Delete the snapshot itself
        await Snapshot.findByIdAndDelete(oldSnapshot._id);

        console.log(`✅ Deleted old snapshot from ${oldSnapshot.snapshotDate}`);
      }
    }
  } catch (error) {
    console.error('❌ Error cleaning up old snapshots:', error);
  }
}

















