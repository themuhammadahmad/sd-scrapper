// delete-separateTableParser-data.js
import mongoose from 'mongoose';
import readline from 'readline';
import StaffDirectory from './models/StaffDirectory.js';
import Site from './models/Site.js';
import Snapshot from './models/Snapshot.js';
import ChangeLog from './models/ChangeLog.js';
import StaffProfile from './models/StaffProfile.js';

const MONGODB_URI = "mongodb+srv://learnFirstAdmin:mT4aOUQ8IeZlGqf6@khareedofrokht.h4nje.mongodb.net/universities?retryWrites=true&w=majority&appName=khareedofrokht";

// Create readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Promisify the question function
const askQuestion = (question) => {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer);
        });
    });
};

async function deleteSeparateTableParserData() {
    try {
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

        // Find all staff directories with successfulParser = "separateTableParser"
        const directories = await StaffDirectory.find({ 
            successfulParser: "separateTableParser" 
        }).lean();

        console.log(`📊 Found ${directories.length} staff directories with successfulParser = "separateTableParser"\n`);

        // Check if count is exactly 20
        if (directories.length !== 20) {
            console.log(`❌ ERROR: Expected 20 directories, but found ${directories.length}`);
            console.log(`   Cannot proceed. Please investigate why count doesn't match.\n`);
            
            if (directories.length > 0) {
                console.log('📋 Directories found:');
                directories.forEach((dir, idx) => {
                    console.log(`   ${idx + 1}. ${dir.staffDirectory || dir.baseUrl}`);
                    console.log(`      Parser: ${dir.successfulParser}`);
                    console.log(`      School: ${dir.schoolName || 'No name'}\n`);
                });
            }
            
            rl.close();
            await mongoose.disconnect();
            return;
        }

        console.log(`✅ Count verified: ${directories.length} directories (matches expected 20)\n`);
        console.log('⚠️  WARNING: This will delete ALL scraped data for these directories!');
        console.log('   Including:');
        console.log('   - Snapshots');
        console.log('   - ChangeLogs');
        console.log('   - StaffProfiles');
        console.log('   - Sites (if linked)');
        console.log('\n   Directories to be deleted:');
        
        directories.forEach((dir, idx) => {
            console.log(`   ${idx + 1}. ${dir.staffDirectory || dir.baseUrl}`);
            console.log(`      School: ${dir.schoolName || 'No name'}`);
            console.log(`      IPEDS: ${dir.ipeds || 'None'}\n`);
        });

        // Ask for confirmation
        console.log('\n🔴 To proceed, type: DELETE ALL DATA');
        const confirmation = await askQuestion('Enter confirmation phrase: ');

        if (confirmation !== 'DELETE ALL DATA') {
            console.log('\n❌ Deletion cancelled. Confirmation phrase not matched.');
            rl.close();
            await mongoose.disconnect();
            return;
        }

        console.log('\n🚀 Starting deletion process...\n');

        let totalSnapshots = 0;
        let totalChangeLogs = 0;
        let totalStaffProfiles = 0;
        let totalSites = 0;
        let totalDirectoriesDeleted = 0;

        // Process each directory
        for (const directory of directories) {
            console.log(`\n📦 Processing: ${directory.staffDirectory || directory.baseUrl}`);
            
            // Find the associated site
            const site = await Site.findOne({ 
                $or: [
                    { baseUrl: directory.baseUrl },
                    { staffDirectory: directory.staffDirectory }
                ]
            });

            if (site) {
                console.log(`   Site ID: ${site._id}`);
                console.log(`   Site URL: ${site.baseUrl}`);

                // Count and delete snapshots
                const snapshotCount = await Snapshot.countDocuments({ site: site._id });
                const deletedSnapshots = await Snapshot.deleteMany({ site: site._id });
                totalSnapshots += deletedSnapshots.deletedCount;
                console.log(`   📸 Snapshots: ${deletedSnapshots.deletedCount} deleted (${snapshotCount} total)`);

                // Count and delete change logs
                const changeLogCount = await ChangeLog.countDocuments({ site: site._id });
                const deletedChangeLogs = await ChangeLog.deleteMany({ site: site._id });
                totalChangeLogs += deletedChangeLogs.deletedCount;
                console.log(`   📝 ChangeLogs: ${deletedChangeLogs.deletedCount} deleted (${changeLogCount} total)`);

                // Count and delete staff profiles
                const profileCount = await StaffProfile.countDocuments({ site: site._id });
                const deletedProfiles = await StaffProfile.deleteMany({ site: site._id });
                totalStaffProfiles += deletedProfiles.deletedCount;
                console.log(`   👤 StaffProfiles: ${deletedProfiles.deletedCount} deleted (${profileCount} total)`);

                // Delete the site itself
                const deletedSite = await Site.deleteOne({ _id: site._id });
                if (deletedSite.deletedCount > 0) {
                    totalSites += deletedSite.deletedCount;
                    console.log(`   🌐 Site deleted`);
                }
            } else {
                console.log(`   ⚠️  No associated site found, but will still delete StaffDirectory entry`);
            }

            // Delete the staff directory entry
            const deletedDirectory = await StaffDirectory.deleteOne({ _id: directory._id });
            if (deletedDirectory.deletedCount > 0) {
                totalDirectoriesDeleted++;
                console.log(`   📁 StaffDirectory entry deleted`);
            }
        }

        // Final summary
        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('✅ DELETION COMPLETE');
        console.log('═══════════════════════════════════════════════════════════');
        console.log(`📊 Summary Statistics:`);
        console.log(`   🗂️  Directories processed: ${directories.length}`);
        console.log(`   📁 StaffDirectory entries deleted: ${totalDirectoriesDeleted}`);
        console.log(`   📸 Snapshots deleted: ${totalSnapshots}`);
        console.log(`   📝 ChangeLogs deleted: ${totalChangeLogs}`);
        console.log(`   👤 StaffProfiles deleted: ${totalStaffProfiles}`);
        console.log(`   🌐 Sites deleted: ${totalSites}`);
        console.log('\n✨ All data for separateTableParser directories has been removed.');

        // Verify deletion
        console.log('\n🔍 Verifying deletion...');
        const remainingDirectories = await StaffDirectory.find({ 
            successfulParser: "separateTableParser" 
        }).countDocuments();
        
        if (remainingDirectories === 0) {
            console.log('✅ Verification passed: No remaining separateTableParser directories found.');
        } else {
            console.log(`⚠️  Warning: ${remainingDirectories} separateTableParser directories still exist!`);
        }

        rl.close();
        await mongoose.disconnect();
        console.log('\n👋 Disconnected from MongoDB');

    } catch (error) {
        console.error('❌ Error:', error);
        rl.close();
        await mongoose.disconnect();
        process.exit(1);
    }
}

// Handle process termination
process.on('SIGINT', async () => {
    console.log('\n🛑 Interrupted. Disconnecting...');
    rl.close();
    await mongoose.disconnect();
    process.exit(0);
});

// Run the script
deleteSeparateTableParserData();