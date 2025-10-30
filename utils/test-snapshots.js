// test-snapshots.js
import Snapshot from "../models/Snapshot.js";
import { detectChangesUsingSnapshotMembers } from "./processStaffDirectory.js"; // Adjust import path
import crypto from "crypto";
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

export async function createTestSnapshots(siteId) {
  let snapshot1, snapshot2;
  
  try {
// Scenario 2: Person moves categories + appears in multiple categories
const snapshot1 = {
  categories: [
    {
      name: "Engineering",
      members: [
        {
          fingerprint: createPersonFingerprint({ name: "Alice Code", email: "alice@company.com" }),
          name: "Alice Code",
          title: "Software Engineer",
          emails: ["alice@company.com"],
          phones: ["+1111111111"],
          category: "Engineering"
        },
        {
          fingerprint: createPersonFingerprint({ name: "Bob Build", email: "bob@company.com" }),
          name: "Bob Build",
          title: "DevOps Engineer",
          emails: ["bob@company.com"],
          phones: ["+2222222222"],
          category: "Engineering"
        }
      ]
    }
  ]
};

const snapshot2 = {
  categories: [
    {
      name: "Leadership",
      members: [
        {
          fingerprint: createPersonFingerprint({ name: "Alice Code", email: "alice@company.com" }),
          name: "Alice Code",
          title: "Engineering Manager", // Title changed
          emails: ["alice@company.com", "alice.manager@company.com"], // Email added
          phones: ["+1111111111"],
          category: "Leadership" // Category changed
        }
      ]
    },
    {
      name: "Engineering",
      members: [
        {
          fingerprint: createPersonFingerprint({ name: "Bob Build", email: "bob@company.com" }),
          name: "Bob Build",
          title: "Senior DevOps Engineer", // Title changed
          emails: ["bob@company.com"],
          phones: ["+2222222222", "+3333333333"], // Phone added
          category: "Engineering"
        },
        {
          fingerprint: createPersonFingerprint({ name: "Alice Code", email: "alice@company.com" }),
          name: "Alice Code",
          title: "Engineering Manager",
          emails: ["alice@company.com", "alice.manager@company.com"],
          phones: ["+1111111111"],
          category: "Engineering" // Same person in multiple categories
        }
      ]
    }
  ]
};
// Expected: Added: 0, Removed: 0, Updated: 2 (both Alice and Bob updated)

    // Test change detection
    const changes = await detectChangesUsingSnapshotMembers(snapshot1, snapshot2, siteId);
    
    // Build comprehensive test results
    const testResults = {
      success: true,
      testScenario: "Manual change detection test",
      expectedResults: {
        added: 1,
        removed: 0,
        updated: 1
      },
      actualResults: {
        added: changes.added.length,
        removed: changes.removed.length,
        updated: changes.updated.length
      },
      changes: changes,
      details: {
        addedMembers: changes.added.map(a => ({ name: a.name, fingerprint: a.fingerprint })),
        removedMembers: changes.removed.map(r => ({ name: r.name, fingerprint: r.fingerprint })),
        updatedMembers: changes.updated.map(u => ({
          name: u.name,
          fingerprint: u.fingerprint,
          changedFields: u.diffs ? Object.keys(u.diffs) : []
        }))
      },
      verification: {
        addedCorrect: changes.added.length === 1 && changes.added[0]?.name === "Jane New",
        removedCorrect: changes.removed.length === 0,
        updatedCorrect: changes.updated.length === 1 && changes.updated[0]?.name === "John Developer",
        allTestsPassed: changes.added.length === 1 && changes.removed.length === 0 && changes.updated.length === 1
      }
    };

    // Log for debugging
    console.log('🔍 TEST RESULTS:');
    console.log(`Added: ${changes.added.length} (Expected: 1 - Jane New)`);
    console.log(`Removed: ${changes.removed.length} (Expected: 0)`);
    console.log(`Updated: ${changes.updated.length} (Expected: 1 - John Developer)`);
    
    if (changes.updated.length > 0) {
      const johnUpdate = changes.updated.find(u => u.name === "John Developer");
      if (johnUpdate && johnUpdate.diffs) {
        console.log('John changes detected:', Object.keys(johnUpdate.diffs));
        testResults.details.sampleUpdate = {
          name: johnUpdate.name,
          changedFields: Object.keys(johnUpdate.diffs),
          diffs: johnUpdate.diffs
        };
      }
    }

    return testResults;

  } catch (error) {
    console.error('❌ Error in test snapshots:', error);
    return {
      success: false,
      error: error.message,
      testScenario: "Manual change detection test"
    };
  } finally {
    // Cleanup - remove test snapshots
    if (snapshot1 && snapshot2) {
      try {
        await Snapshot.deleteMany({ _id: { $in: [snapshot1._id, snapshot2._id] } });
        console.log('✅ Test snapshots cleaned up');
      } catch (cleanupError) {
        console.error('⚠️ Failed to cleanup test snapshots:', cleanupError);
      }
    }
  }
}
