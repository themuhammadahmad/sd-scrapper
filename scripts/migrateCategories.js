// scripts/migrateCategories.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Site from '../models/Site.js';
import Snapshot from '../models/Snapshot.js';
import StaffProfile from '../models/StaffProfile.js';

dotenv.config();

async function migrateCategories() {
  try {
    await mongoose.connect("mongodb+srv://learnFirstAdmin:mT4aOUQ8IeZlGqf6@khareedofrokht.h4nje.mongodb.net/universities?retryWrites=true&w=majority&appName=khareedofrokht");
    console.log('✅ Connected to MongoDB');
    
    // Get all sites
    const sites = await Site.find().lean();
    console.log(`📊 Found ${sites.length} sites to process`);
    
    let totalUpdated = 0;
    let totalFailed = 0;
    
    for (const site of sites) {
      console.log(`\n🔍 Processing ${site.baseUrl}...`);
      
      try {
        // Get the latest snapshot for this site
        const latestSnapshot = await Snapshot.findOne({ site: site._id })
          .sort({ snapshotDate: -1 })
          .lean();
        
        if (!latestSnapshot || !latestSnapshot.categories) {
          console.log(`   ⚠️ No snapshot data found`);
          continue;
        }
        
        console.log(`   📅 Latest snapshot: ${latestSnapshot.snapshotDate}`);
        console.log(`   📋 Categories: ${latestSnapshot.categories.length}`);
        
        // Create a map of fingerprint -> categories
        const categoryMap = new Map();
        
        for (const category of latestSnapshot.categories) {
          if (!category.members || category.members.length === 0) continue;
          
          for (const member of category.members) {
            if (!member.fingerprint) continue;
            
            if (!categoryMap.has(member.fingerprint)) {
              categoryMap.set(member.fingerprint, [category.name]);
            } else {
              const existing = categoryMap.get(member.fingerprint);
              if (!existing.includes(category.name)) {
                existing.push(category.name);
              }
            }
          }
        }
        
        console.log(`   👥 Found ${categoryMap.size} unique fingerprints in snapshot`);
        
        // Update each StaffProfile
        let siteUpdated = 0;
        let siteFailed = 0;
        
        for (const [fingerprint, categories] of categoryMap.entries()) {
          try {
            const result = await StaffProfile.updateOne(
              { fingerprint, site: site._id },
              { $set: { categories } },
              { upsert: false }
            );
            
            if (result.modifiedCount > 0) {
              siteUpdated++;
            }
          } catch (error) {
            siteFailed++;
            console.error(`   ❌ Error updating fingerprint ${fingerprint}:`, error.message);
          }
        }
        
        console.log(`   ✅ Updated ${siteUpdated} profiles, failed: ${siteFailed}`);
        
        totalUpdated += siteUpdated;
        totalFailed += siteFailed;
        
      } catch (error) {
        console.error(`   ❌ Error processing site ${site.baseUrl}:`, error.message);
      }
    }
    
    console.log(`\n🎉 Migration complete!`);
    console.log(`✅ Total updated: ${totalUpdated}`);
    console.log(`❌ Total failed: ${totalFailed}`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run the migration
migrateCategories();