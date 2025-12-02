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
    await mongoose.connect("mongodb+srv://learnFirstAdmin:mT4aOUQ8IeZlGqf6@khareedofrokht.h4nje.mongodb.net/universities?retryWrites=true&w=majority&appName=khareedofrokht");
    console.log('✅ Connected to MongoDB');

    // Read your JSON file
    const filePath = path.join(__dirname,  'public', 'data', 'ncca', 'staff0-directories.json');
    const directories = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    
    console.log(`📋 Found ${directories.length} directories in JSON file`);

    let imported = 0;
    let skipped = 0;
    let errors = 0;
    
    // Process each directory
    for (const dir of directories) {
      try {
        // Use upsert to avoid duplicates
        const result = await StaffDirectory.findOneAndUpdate(
          { staffDirectory: dir.staffDirectory },
          {
            $setOnInsert: {
              baseUrl: dir.baseUrl,
              staffDirectory: dir.staffDirectory,
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
          console.log(`✅ Imported: ${dir.baseUrl}`);
        } else {
          skipped++;
          console.log(`⏭️ Skipped (already exists): ${dir.baseUrl}`);
        }
      } catch (error) {
        errors++;
        console.log(`❌ Error importing ${dir.staffDirectory}:`, error.message);
      }
    }
    
    console.log(`\n🎉 Migration complete!`);
    console.log(`📊 Results: ${imported} imported, ${skipped} skipped, ${errors} errors`);
    
    // Get final count
    const totalInDB = await StaffDirectory.countDocuments();
    console.log(`📈 Total directories in database: ${totalInDB}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
migrateDirectories();