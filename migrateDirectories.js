// scripts/migrateDirectories.js
import mongoose from 'mongoose';
import StaffDirectory from './models/StaffDirectory.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrateDirectories() {
  try {
    // Connect to MongoDB (use your existing connection string)
    let mongoStr = "mongodb://127.0.0.1:27017/universities";
    let online = "mongodb+srv://learnFirstAdmin:mT4aOUQ8IeZlGqf6@khareedofrokht.h4nje.mongodb.net/universities?retryWrites=true&w=majority&appName=khareedofrokht";
    await mongoose.connect(online);
    console.log('✅ Connected to MongoDB');

    // Read your merged JSON file
    const filePath = path.join(__dirname, 'public', 'data', 'fixed-directories.json');
    console.log(filePath)
    const directories = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    
    console.log(`📋 Found ${directories.length} directories in fixed-directories.json`);

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

        // Use upsert to avoid duplicates
        const result = await StaffDirectory.findOneAndUpdate(
          { staffDirectory: dir.staffDirectory },
          {
            $set: {
              baseUrl: dir.baseUrl,
              staffDirectory: dir.staffDirectory,
              ipeds: dir.ipeds || '',
              schoolName: dir.schoolName || '',
              isActive: true
            }
          },
          { 
            upsert: true, 
            new: true,
            runValidators: true 
          }
        );

        if (result.isNew) {
          imported++;
          console.log(`✅ Imported: ${dir.schoolName || dir.baseUrl} (IPEDS: ${dir.ipeds || 'none'})`);
        } else {
          // Check if IPEDS or schoolName was updated
          const wasUpdated = 
            (result.ipeds !== (dir.ipeds || '')) || 
            (result.schoolName !== (dir.schoolName || ''));
          
          if (wasUpdated) {
            updated++;
            console.log(`🔄 Updated: ${dir.schoolName || dir.baseUrl} with IPEDS: ${dir.ipeds || 'none'}`);
          } else {
            skipped++;
            console.log(`⏭️ Skipped (already exists): ${dir.schoolName || dir.baseUrl}`);
          }
        }
      } catch (error) {
        errors++;
        console.log(`❌ Error importing ${dir.staffDirectory}:`, error.message);
      }
    }
    
    console.log(`\n🎉 Migration complete!`);
    console.log(`📊 Results: ${imported} imported, ${updated} updated, ${skipped} skipped, ${errors} errors`);
    
    // Get statistics
    const totalInDB = await StaffDirectory.countDocuments();
    const withIpeds = await StaffDirectory.countDocuments({ ipeds: { $ne: '' } });
    const withoutIpeds = await StaffDirectory.countDocuments({ ipeds: '' });
    
    console.log(`📈 Total directories in database: ${totalInDB}`);
    console.log(`🎓 With IPEDS data: ${withIpeds}`);
    console.log(`❓ Without IPEDS data: ${withoutIpeds}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
migrateDirectories();