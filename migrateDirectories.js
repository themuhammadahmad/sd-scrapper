// scripts/migrateDirectories.js
import mongoose from 'mongoose';
import StaffDirectory from './models/StaffDirectory.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrateDirectories() {
  try {
    // Connect to MongoDB
    let online = process.env.MONGODB_URI || "mongodb+srv://learnFirstAdmin:mT4aOUQ8IeZlGqf6@khareedofrokht.h4nje.mongodb.net/universities?retryWrites=true&w=majority&appName=khareedofrokht";
    await mongoose.connect(online, {
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
    console.log('✅ Connected to MongoDB\n');

    // Read your merged JSON file
    const filePath = path.join(__dirname, 'all_sports_websites.json');
    console.log(`📂 Reading: ${filePath}`);
    let directories = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    console.log(`📋 Found ${directories.length} directories in all_sports_websites.json\n`);

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    // Process each directory
    for (const dir of directories) {
      try {
        if (!dir.baseUrl || !dir.staffDirectory) {
          console.log(`⚠️ Skipping entry with missing required fields:`, dir);
          skipped++;
          continue;
        }

        // FIRST: Check if the directory already exists
        const existingDir = await StaffDirectory.findOne({ 
          staffDirectory: dir.staffDirectory 
        });

        if (!existingDir) {
          // DOES NOT EXIST - Create new directory
          const newDirectory = new StaffDirectory({
            baseUrl: dir.baseUrl,
            staffDirectory: dir.staffDirectory,
            ipeds: dir.ipeds || '',
            schoolName: dir.schoolName || '',
            isActive: true,
            successfulParser: null,
            parserFailedLastTime: false,
            processCount: 0,
            lastStaffCount: 0
          });
          
          await newDirectory.save();
          imported++;
          console.log(`✅ IMPORTED (${imported}): ${dir.schoolName || dir.baseUrl}`);
          console.log(`   Staff Directory: ${dir.staffDirectory}`);
          console.log(`   IPEDS: ${dir.ipeds || 'none'}\n`);
          
        } else {
          // EXISTS - Check if any fields need updating
          let needsUpdate = false;
          const updateFields = {};
          
          if (existingDir.baseUrl !== dir.baseUrl) {
            updateFields.baseUrl = dir.baseUrl;
            needsUpdate = true;
          }
          if (existingDir.ipeds !== (dir.ipeds || '')) {
            updateFields.ipeds = dir.ipeds || '';
            needsUpdate = true;
          }
          if (existingDir.schoolName !== (dir.schoolName || '')) {
            updateFields.schoolName = dir.schoolName || '';
            needsUpdate = true;
          }
          if (existingDir.isActive !== true) {
            updateFields.isActive = true;
            needsUpdate = true;
          }
          
          if (needsUpdate) {
            await StaffDirectory.updateOne(
              { staffDirectory: dir.staffDirectory },
              { $set: updateFields }
            );
            updated++;
            console.log(`🔄 UPDATED (${updated}): ${dir.schoolName || dir.baseUrl}`);
            console.log(`   Staff Directory: ${dir.staffDirectory}`);
            console.log(`   Fields updated: ${Object.keys(updateFields).join(', ')}\n`);
          } else {
            skipped++;
            // Only log every 100th skipped to avoid console spam
            if (skipped % 100 === 0) {
              console.log(`⏭️ Skipped (${skipped} so far): ${dir.schoolName || dir.baseUrl} - already exists with current data\n`);
            }
          }
        }
        
      } catch (error) {
        errors++;
        console.log(`❌ Error importing ${dir.staffDirectory}:`, error.message);
      }
    }

    console.log(`\n═══════════════════════════════════════════════════════════`);
    console.log(`🎉 MIGRATION COMPLETE`);
    console.log(`═══════════════════════════════════════════════════════════`);
    console.log(`📊 Results:`);
    console.log(`   ✅ Imported (new): ${imported}`);
    console.log(`   🔄 Updated: ${updated}`);
    console.log(`   ⏭️ Skipped (already exists): ${skipped}`);
    console.log(`   ❌ Errors: ${errors}`);
    console.log(`   📁 Total processed: ${directories.length}`);

    // Get statistics
    const totalInDB = await StaffDirectory.countDocuments();
    const withIpeds = await StaffDirectory.countDocuments({ ipeds: { $ne: '' } });
    const withoutIpeds = await StaffDirectory.countDocuments({ ipeds: '' });

    console.log(`\n📈 Database Statistics:`);
    console.log(`   Total directories in database: ${totalInDB}`);
    console.log(`   With IPEDS data: ${withIpeds}`);
    console.log(`   Without IPEDS data: ${withoutIpeds}`);

    process.exit(0);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
migrateDirectories();