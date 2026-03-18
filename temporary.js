// temporary.js

// MongoDB connection URI - CHANGE THIS TO YOUR ACTUAL MONGODB URI
const MONGODB_URI = "mongodb://localhost:27017/temporary";

import mongoose from 'mongoose';
import processStaffDirectory from './utils/processStaffDirectory.js';
import StaffDirectory from './models/StaffDirectory.js';
import Site from './models/Site.js';
import Snapshot from './models/Snapshot.js';
import StaffProfile from './models/StaffProfile.js';
import ChangeLog from './models/ChangeLog.js';
import FailedDirectory from './models/FailedDirectory.js';

// Test configuration - CHANGE THESE VALUES
const TEST_URLS = [
  {
    baseUrl: "http://www.cmuchippewas.com",
    staffDirectory: "http://www.cmuchippewas.com/staff-directory"
  }
  // Add more test URLs if needed
];

async function connectToMongo() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

async function clearTestData(baseUrl, staffDirectory) {
  console.log(`\n🧹 Clearing existing test data for ${baseUrl}...`);
  
  // Find the site
  const site = await Site.findOne({ baseUrl });
  
  if (site) {
    // Delete all snapshots for this site
    const snapshots = await Snapshot.find({ site: site._id });
    console.log(`   Found ${snapshots.length} snapshots to delete`);
    
    // Delete change logs
    const changeLogs = await ChangeLog.find({ site: site._id });
    console.log(`   Found ${changeLogs.length} change logs to delete`);
    
    await ChangeLog.deleteMany({ site: site._id });
    await Snapshot.deleteMany({ site: site._id });
    
    // Delete site
    await Site.findByIdAndDelete(site._id);
    console.log(`   Deleted site record`);
  }
  
  // Delete staff profiles for this directory
  const staffProfiles = await StaffProfile.find({ 
    'raw.url': staffDirectory 
  });
  console.log(`   Found ${staffProfiles.length} staff profiles to delete`);
  await StaffProfile.deleteMany({ 'raw.url': staffDirectory });
  
  // Clean up failed directory entries
  await FailedDirectory.deleteMany({ staffDirectory });
  
  console.log('✅ Test data cleared');
}

async function displayResults(runNumber, result, site) {
  console.log(`\n📊 === RUN ${runNumber} RESULTS ===`);
  console.log(`Success: ${result.success}`);
  console.log(`Staff Count: ${result.staffCount}`);
  console.log(`Used Puppeteer: ${result.usedPuppeteer}`);
  console.log(`Used Parser: ${result.usedParser || 'none'}`);
  
  if (result.success && site) {
    // Get snapshot info
    const snapshot = await Snapshot.findById(site.latestSnapshot);
    if (snapshot) {
      console.log(`\n📸 Snapshot created:`);
      console.log(`   ID: ${snapshot._id}`);
      console.log(`   Date: ${snapshot.snapshotDate}`);
      console.log(`   Total Count: ${snapshot.totalCount}`);
      console.log(`   Categories: ${snapshot.categories.length}`);
      
      // Show sample of staff
      if (snapshot.categories.length > 0 && snapshot.categories[0].members.length > 0) {
        console.log(`\n👥 Sample staff (first 3):`);
        snapshot.categories[0].members.slice(0, 3).forEach((member, i) => {
          console.log(`   ${i+1}. ${member.name} - ${member.title || 'No title'}`);
        });
      }
    }
  }
}

async function displayChangeLogs(site) {
  const changeLogs = await ChangeLog.find({ site: site._id })
    .populate('fromSnapshot')
    .populate('toSnapshot')
    .sort({ createdAt: -1 });
  
  if (changeLogs.length === 0) {
    console.log('\n📝 No change logs found');
    return;
  }
  
  console.log('\n📝 === CHANGE LOGS ===');
  for (const log of changeLogs) {
    console.log(`\nChange Log ID: ${log._id}`);
    console.log(`From Snapshot: ${log.fromSnapshot?.snapshotDate || 'N/A'} (${log.fromSnapshot?._id || 'N/A'})`);
    console.log(`To Snapshot: ${log.toSnapshot?.snapshotDate || 'N/A'} (${log.toSnapshot?._id || 'N/A'})`);
    console.log(`Added: ${log.added?.length || 0} people`);
    console.log(`Removed: ${log.removed?.length || 0} people`);
    console.log(`Updated: ${log.updated?.length || 0} people`);
    
    // Show details of changes if any
    if (log.added?.length > 0) {
      console.log(`\n  ➕ Added (first 3):`);
      log.added.slice(0, 3).forEach((person, i) => {
        console.log(`    ${i+1}. ${person.name} (${person.fingerprint})`);
      });
    }
    
    if (log.removed?.length > 0) {
      console.log(`\n  ➖ Removed (first 3):`);
      log.removed.slice(0, 3).forEach((person, i) => {
        console.log(`    ${i+1}. ${person.name} (${person.fingerprint})`);
      });
    }
    
    if (log.updated?.length > 0) {
      console.log(`\n  ✏️ Updated (first 3):`);
      log.updated.slice(0, 3).forEach((person, i) => {
        console.log(`    ${i+1}. ${person.name} - ${Object.keys(person.diffs || {}).join(', ')}`);
      });
    }
  }
}

async function displayAllSnapshots(site) {
  const snapshots = await Snapshot.find({ site: site._id })
    .sort({ snapshotDate: 1 });
  
  console.log('\n📸 === ALL SNAPSHOTS ===');
  snapshots.forEach((snap, index) => {
    console.log(`\nSnapshot ${index + 1}:`);
    console.log(`   ID: ${snap._id}`);
    console.log(`   Date: ${snap.snapshotDate}`);
    console.log(`   Total Count: ${snap.totalCount}`);
    console.log(`   Hash: ${snap.hash.substring(0, 8)}...`);
  });
}

async function runTest() {
  console.log('🚀 Starting processStaffDirectory test script');
  console.log('='.repeat(60));
  
  await connectToMongo();
  
  for (const testUrl of TEST_URLS) {
    const { baseUrl, staffDirectory } = testUrl;
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔍 TESTING: ${baseUrl}`);
    console.log(`📁 Directory: ${staffDirectory}`);
    console.log('='.repeat(60));
    
    // Clear existing data for clean test
    await clearTestData(baseUrl, staffDirectory);
    
    // RUN 1: First scrape
// RUN 1: First scrape (with testMode to remove email)
console.log(`\n${'🟢'.repeat(10)} RUN 1: FIRST SCRAPE (NO EMAIL) ${'🟢'.repeat(10)}`);
const result1 = await processStaffDirectory(baseUrl, staffDirectory, null, 'first-scrape');
    
    // Get site after first run
    const site1 = await Site.findOne({ baseUrl });
    await displayResults(1, result1, site1);
    
    // Wait a moment to ensure timestamps are different
    console.log('\n⏳ Waiting 2 seconds before second scrape...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
// RUN 2: Second scrape (with testMode to restore email)
console.log(`\n${'🔵'.repeat(10)} RUN 2: SECOND SCRAPE (WITH EMAIL) ${'🔵'.repeat(10)}`);
const result2 = await processStaffDirectory(baseUrl, staffDirectory, result1.usedParser, 'second-scrape');
    
    // Get site after second run
    const site2 = await Site.findOne({ baseUrl });
    await displayResults(2, result2, site2);
    
    // Display all snapshots
    if (site2) {
      await displayAllSnapshots(site2);
      await displayChangeLogs(site2);
    }
    
    // Summary
    console.log(`\n${'⭐'.repeat(10)} TEST SUMMARY ${'⭐'.repeat(10)}`);
    console.log(`First scrape: ${result1.success ? '✅' : '❌'} (${result1.staffCount} staff)`);
    console.log(`Second scrape: ${result2.success ? '✅' : '❌'} (${result2.staffCount} staff)`);
    
    if (result1.success && result2.success) {
      console.log(`\nChange detection:`);
      console.log(`- Staff count diff: ${result2.staffCount - result1.staffCount}`);
      
      // Verify if snapshots are different
      if (site2) {
        const snapshots = await Snapshot.find({ site: site2._id }).sort({ snapshotDate: 1 });
        if (snapshots.length === 2) {
          console.log(`- Snapshots created: 2 (as expected)`);
          console.log(`- Hashes ${snapshots[0].hash === snapshots[1].hash ? 'match' : 'differ'}`);
        } else {
          console.log(`- Snapshots created: ${snapshots.length} (expected 2)`);
        }
      }
    }
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('✅ Test script completed');
  
  // Close MongoDB connection
  await mongoose.connection.close();
  console.log('🔌 Disconnected from MongoDB');
}

// Run the test
runTest().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});