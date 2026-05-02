// utils/stress-test-comparison.js
import { detectChangesUsingSnapshotMembers } from "./processStaffDirectory.js";
import crypto from "crypto";
import mongoose from "mongoose";

/**
 * Helper to create a member object
 */
function createMember(fingerprint, name, title, emails = [], categories = []) {
  return {
    fingerprint,
    name,
    title,
    emails,
    categories,
    data: { name, title, emails, phones: [], profileUrl: '' }
  };
}

async function runStressTests() {
  console.log("🚀 Starting Stress Tests for Comparison System...\n");

  const siteId = new mongoose.Types.ObjectId();

  // --- SCENARIO 1: Shared Name (Now Supported) ---
  // Two people with the same name, but different titles.
  const johnDevFp = crypto.createHash("md5").update("john smith|dev").digest("hex");
  const johnMgrFp = crypto.createHash("md5").update("john smith|manager").digest("hex");
  
  const snap1_S1 = {
    categories: [{
      name: "Engineering",
      members: [createMember(johnDevFp, "John Smith", "Dev")]
    }]
  };
  
  const snap2_S1 = {
    categories: [{
      name: "Engineering",
      members: [
        createMember(johnDevFp, "John Smith", "Dev"),
        createMember(johnMgrFp, "John Smith", "Manager") // Now correctly distinguished
      ]
    }]
  };

  // --- SCENARIO 2: Email Swap ---
  const aliceFp = "alice_fp";
  const bobFp = "bob_fp";
  
  const snap1_S2 = {
    categories: [{
      name: "Sales",
      members: [
        createMember(aliceFp, "Alice", "Rep", ["alice@test.com"]),
        createMember(bobFp, "Bob", "Lead", ["bob@test.com"])
      ]
    }]
  };

  const snap2_S2 = {
    categories: [{
      name: "Sales",
      members: [
        createMember(aliceFp, "Alice", "Rep", ["bob@test.com"]), // Alice took Bob's email
        createMember(bobFp, "Bob", "Lead", ["alice@test.com"])  // Bob took Alice's email
      ]
    }]
  };

  // --- SCENARIO 3: Multi-Category Transitions ---
  const charlieFp = "charlie_fp";
  const snap1_S3 = {
    categories: [
      { name: "HR", members: [createMember(charlieFp, "Charlie", "Staff")] },
      { name: "Admin", members: [createMember(charlieFp, "Charlie", "Staff")] }
    ]
  };
  const snap2_S3 = {
    categories: [
      { name: "HR", members: [createMember(charlieFp, "Charlie", "Staff")] }
      // Removed from Admin
    ]
  };

  // --- SCENARIO 4: Whitespace and Case ---
  const daveFp = "dave_fp";
  const snap1_S4 = {
    categories: [{ name: "IT", members: [createMember(daveFp, "Dave", "Admin", ["DAVE@TEST.COM"])] }]
  };
  const snap2_S4 = {
    categories: [{ name: "IT", members: [createMember(daveFp, " Dave ", "admin", [" dave@test.com "])] }]
  };

  // --- RUNNING TESTS ---

  console.log("🧪 Test 1: Shared Name (Duplicate fingerprints)");
  const changes1 = await detectChangesUsingSnapshotMembers(snap1_S1, snap2_S1, siteId);
  console.log(`Result: Added: ${changes1.added.length}, Updated: ${changes1.updated.length}, Removed: ${changes1.removed.length}`);
  // Note: Since fingerprints are the same, the map will overwrite. 
  // This exposes that the system relies 100% on fingerprint uniqueness.

  console.log("\n🧪 Test 2: Email Swap");
  const changes2 = await detectChangesUsingSnapshotMembers(snap1_S2, snap2_S2, siteId);
  console.log(`Alice Updated: ${changes2.updated.some(u => u.fingerprint === aliceFp && u.diffs.emails)}`);
  console.log(`Bob Updated: ${changes2.updated.some(u => u.fingerprint === bobFp && u.diffs.emails)}`);

  console.log("\n🧪 Test 3: Category Removal (Multi-category person)");
  const changes3 = await detectChangesUsingSnapshotMembers(snap1_S3, snap2_S3, siteId);
  console.log(`Charlie Updated Categories: ${changes3.updated.some(u => u.fingerprint === charlieFp && u.diffs.categories)}`);
  console.log(`Charlie Removed: ${changes3.removed.some(r => r.fingerprint === charlieFp)}`);

  console.log("\n🧪 Test 4: Case & Whitespace Robustness");
  const changes4 = await detectChangesUsingSnapshotMembers(snap1_S4, snap2_S4, siteId);
  console.log(`Dave Has Changes: ${changes4.updated.length > 0 ? 'YES ❌' : 'NO ✅'}`);
  if (changes4.updated.length > 0) {
     console.log("Diffs detected:", JSON.stringify(changes4.updated[0].diffs, null, 2));
  }

  // --- SCENARIO 5: The Email Change (Real Fingerprinting) ---
  console.log("\n🧪 Test 5: Email Change (Dynamic Fingerprinting)");
  // This simulates Alice changing her email from a@b.com to x@y.com
  const email1 = "a@b.com";
  const email2 = "x@y.com";
  
  const fp1 = crypto.createHash("md5").update(email1).digest("hex");
  const fp2 = crypto.createHash("md5").update(email2).digest("hex");

  const snap1_S5 = {
    categories: [{ name: "Sales", members: [createMember(fp1, "Alice", "Rep", [email1])] }]
  };
  const snap2_S5 = {
    categories: [{ name: "Sales", members: [createMember(fp2, "Alice", "Rep", [email2])] }]
  };

  const changes5 = await detectChangesUsingSnapshotMembers(snap1_S5, snap2_S5, siteId);
  console.log(`Alice Updated: ${changes5.updated.some(u => u.name === "Alice")}`);
  console.log(`Alice Added: ${changes5.added.some(a => a.name === "Alice")}`);
  console.log(`Alice Removed: ${changes5.removed.some(r => r.name === "Alice")}`);

  console.log("\n🏁 Stress Tests Finished.");
}

// Run if direct
if (process.argv[1].endsWith('stress-test-comparison.js')) {
  runStressTests().catch(console.error);
}
