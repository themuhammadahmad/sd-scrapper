// scripts/analyzeSchoolChanges.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import StaffProfile from '../models/StaffProfile.js';
import StaffDirectory from '../models/StaffDirectory.js';
import ChangeLog from '../models/ChangeLog.js';
import Site from '../models/Site.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCHOOL_NAME = process.argv[2] || 'University of Southern California';

async function analyzeSchoolChanges() {
  try {
    console.log(`🔍 Analyzing changes for: ${SCHOOL_NAME}`);
    
    // Connect with SSL options to fix the error
    const MONGODB_URI = 'mongodb+srv://learnFirstAdmin:mT4aOUQ8IeZlGqf6@khareedofrokht.h4nje.mongodb.net/universities?retryWrites=true&w=majority&appName=khareedofrokht';
    
    console.log(`📡 Connecting to MongoDB...`);
    await mongoose.connect(MONGODB_URI, {
      tls: true,
      tlsAllowInvalidCertificates: true,
      serverSelectionTimeoutMS: 30000,
    });
    console.log(`✅ Connected to MongoDB`);
    
    // 1. Find the school
    const staffDir = await StaffDirectory.findOne({ 
      schoolName: { $regex: new RegExp(SCHOOL_NAME, 'i') } 
    });
    
    if (!staffDir) {
      console.log(`❌ School not found: ${SCHOOL_NAME}`);
      const allSchools = await StaffDirectory.find({}, 'schoolName').limit(10);
      console.log('Available schools:', allSchools.map(s => s.schoolName));
      return;
    }
    
    console.log(`\n✅ Found school: ${staffDir.schoolName}`);
    console.log(`   IPEDS: ${staffDir.ipeds}`);
    
    // 2. Find the Site
    const site = await Site.findOne({ baseUrl: staffDir.baseUrl });
    if (!site) {
      console.log(`❌ Site not found`);
      return;
    }
    console.log(`   Site ID: ${site._id}`);
    
    // 3. Get ChangeLogs WITHOUT populate (to avoid schema error)
    const changes = await ChangeLog.find({ site: site._id })
      .sort({ createdAt: -1 })
      .lean();
    
    console.log(`\n📊 Found ${changes.length} change records`);
    
    // 4. Create output file
    const outputDir = path.join(process.cwd(), 'usc-analysis');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFile = path.join(outputDir, `usc-changes-${timestamp}.json`);
    
    // Extract all change data
    const allChangeData = [];
    
    for (const change of changes) {
      const addedList = change.added || change.details?.added || [];
      const removedList = change.removed || change.details?.removed || [];
      const updatedList = change.updated || change.details?.updated || [];
      
      // Process ADDED
      for (const added of addedList) {
        // Extract name from various possible locations
        let fullName = '';
        let firstName = '';
        let lastName = '';
        
        if (added.canonicalName) {
          fullName = added.canonicalName;
        } else if (added.name) {
          fullName = added.name;
        } else if (added.data?.canonicalName) {
          fullName = added.data.canonicalName;
        } else if (added.data?.name) {
          fullName = added.data.name;
        } else if (added.data?.title) {
          fullName = added.data.title;
        } else if (added.title) {
          fullName = added.title;
        }
        
        // Split name if possible
        if (fullName && fullName.includes(' ')) {
          const nameParts = fullName.trim().split(' ');
          firstName = nameParts[0] || '';
          lastName = nameParts.slice(1).join(' ') || '';
        } else if (fullName) {
          firstName = fullName;
          lastName = '';
        }
        
        allChangeData.push({
          changeType: 'n',
          changeDate: change.createdAt,
          ipeds: staffDir.ipeds,
          school: staffDir.schoolName,
          uniqueId: added.fingerprint || added.data?.fingerprint || '',
          sportCode: Array.isArray(added.categories) ? added.categories.join(', ') : (added.data?.categories || []).join(', '),
          firstName: firstName,
          lastName: lastName,
          fullName: fullName,
          position: added.data?.title || added.title || '',
          email: (added.emails && added.emails[0]) || (added.data?.emails && added.data.emails[0]) || '',
          phone: (added.phones && added.phones[0]) || (added.data?.phones && added.data.phones[0]) || '',
          changeDetails: `Added to category`,
          snapshotPeriod: change.fromSnapshot && change.toSnapshot ? 
            `${change.fromSnapshot} → ${change.toSnapshot}` : 'N/A'
        });
      }
      
      // Process REMOVED
      for (const removed of removedList) {
        let fullName = '';
        let firstName = '';
        let lastName = '';
        
        if (removed.canonicalName) {
          fullName = removed.canonicalName;
        } else if (removed.name) {
          fullName = removed.name;
        } else if (removed.data?.canonicalName) {
          fullName = removed.data.canonicalName;
        } else if (removed.data?.name) {
          fullName = removed.data.name;
        } else if (removed.data?.title) {
          fullName = removed.data.title;
        } else if (removed.title) {
          fullName = removed.title;
        }
        
        if (fullName && fullName.includes(' ')) {
          const nameParts = fullName.trim().split(' ');
          firstName = nameParts[0] || '';
          lastName = nameParts.slice(1).join(' ') || '';
        } else if (fullName) {
          firstName = fullName;
          lastName = '';
        }
        
        allChangeData.push({
          changeType: 'r',
          changeDate: change.createdAt,
          ipeds: staffDir.ipeds,
          school: staffDir.schoolName,
          uniqueId: removed.fingerprint || removed.data?.fingerprint || '',
          sportCode: Array.isArray(removed.categories) ? removed.categories.join(', ') : (removed.data?.categories || []).join(', '),
          firstName: firstName,
          lastName: lastName,
          fullName: fullName,
          position: removed.data?.title || removed.title || '',
          email: (removed.emails && removed.emails[0]) || (removed.data?.emails && removed.data.emails[0]) || '',
          phone: (removed.phones && removed.phones[0]) || (removed.data?.phones && removed.data.phones[0]) || '',
          changeDetails: `Removed from category`,
          snapshotPeriod: change.fromSnapshot && change.toSnapshot ? 
            `${change.fromSnapshot} → ${change.toSnapshot}` : 'N/A'
        });
      }
      
      // Process UPDATED
      for (const updated of updatedList) {
        const afterData = updated.after || updated;
        let fullName = '';
        let firstName = '';
        let lastName = '';
        
        if (afterData.canonicalName) {
          fullName = afterData.canonicalName;
        } else if (afterData.name) {
          fullName = afterData.name;
        } else if (afterData.data?.canonicalName) {
          fullName = afterData.data.canonicalName;
        } else if (afterData.data?.name) {
          fullName = afterData.data.name;
        } else if (afterData.data?.title) {
          fullName = afterData.data.title;
        } else if (afterData.title) {
          fullName = afterData.title;
        }
        
        if (fullName && fullName.includes(' ')) {
          const nameParts = fullName.trim().split(' ');
          firstName = nameParts[0] || '';
          lastName = nameParts.slice(1).join(' ') || '';
        } else if (fullName) {
          firstName = fullName;
          lastName = '';
        }
        
        let changeDetails = [];
        if (updated.diffs) {
          for (const [field, diff] of Object.entries(updated.diffs)) {
            changeDetails.push(`${field}: ${diff.before || 'N/A'} → ${diff.after || 'N/A'}`);
          }
        }
        
        allChangeData.push({
          changeType: 'j',
          changeDate: change.createdAt,
          ipeds: staffDir.ipeds,
          school: staffDir.schoolName,
          uniqueId: afterData.fingerprint || updated.fingerprint || '',
          sportCode: Array.isArray(afterData.categories) ? afterData.categories.join(', ') : (afterData.data?.categories || []).join(', '),
          firstName: firstName,
          lastName: lastName,
          fullName: fullName,
          position: afterData.title || afterData.data?.title || '',
          email: (afterData.emails && afterData.emails[0]) || (afterData.data?.emails && afterData.data.emails[0]) || '',
          phone: (afterData.phones && afterData.phones[0]) || (afterData.data?.phones && afterData.data.phones[0]) || '',
          changeDetails: changeDetails.join('; ') || 'Updated',
          snapshotPeriod: change.fromSnapshot && change.toSnapshot ? 
            `${change.fromSnapshot} → ${change.toSnapshot}` : 'N/A'
        });
      }
    }
    
    // Write to JSON file
    fs.writeFileSync(outputFile, JSON.stringify(allChangeData, null, 2));
    console.log(`\n📄 Change data saved to: ${outputFile}`);
    console.log(`   Total records: ${allChangeData.length}`);
    
    // Create a summary
    const summary = {
      school: staffDir.schoolName,
      ipeds: staffDir.ipeds,
      totalChanges: allChangeData.length,
      byType: {
        added: allChangeData.filter(c => c.changeType === 'n').length,
        removed: allChangeData.filter(c => c.changeType === 'r').length,
        updated: allChangeData.filter(c => c.changeType === 'j').length
      },
      missingNames: allChangeData.filter(c => !c.fullName || c.fullName.trim() === '').length,
      namesWithFirstLast: allChangeData.filter(c => c.firstName && c.lastName).length,
      onlyFirstName: allChangeData.filter(c => c.firstName && !c.lastName).length,
      issues: []
    };
    
    // Identify issues
    const missingNameRecords = allChangeData.filter(c => !c.fullName || c.fullName.trim() === '');
    if (missingNameRecords.length > 0) {
      summary.issues.push(`${missingNameRecords.length} records missing full name`);
      
      // Show examples
      console.log('\n🔍 Records with missing names (first 5):');
      for (const record of missingNameRecords.slice(0, 5)) {
        console.log(`   - ${record.changeType} | ${record.sportCode}`);
        console.log(`     Full name field: "${record.fullName}"`);
        console.log(`     Position: ${record.position || 'N/A'}`);
        console.log(`     Email: ${record.email || 'N/A'}`);
        console.log(`     Unique ID: ${record.uniqueId || 'N/A'}`);
      }
    }
    
    // Show examples of good records
    const goodRecords = allChangeData.filter(c => c.fullName && c.fullName.trim() !== '' && !c.fullName.includes('•'));
    if (goodRecords.length > 0) {
      console.log('\n✅ Records with good names (first 3):');
      for (const record of goodRecords.slice(0, 3)) {
        console.log(`   - ${record.changeType} | Full name: "${record.fullName}"`);
        console.log(`     First: "${record.firstName}" | Last: "${record.lastName}"`);
        console.log(`     Position: ${record.position || 'N/A'}`);
      }
    }
    
    // Save summary
    const summaryFile = outputFile.replace('.json', '-summary.json');
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
    console.log(`\n📊 Summary saved to: ${summaryFile}`);
    
    // Print summary
    console.log('\n🎯 SUMMARY:');
    console.log('='.repeat(50));
    console.log(`Total change records: ${summary.totalChanges}`);
    console.log(`  - Added (n): ${summary.byType.added}`);
    console.log(`  - Removed (r): ${summary.byType.removed}`);
    console.log(`  - Updated (j): ${summary.byType.updated}`);
    console.log(`Records with full name: ${summary.totalChanges - summary.missingNames}`);
    console.log(`Records missing names: ${summary.missingNames}`);
    console.log(`Records with first+last name: ${summary.namesWithFirstLast}`);
    console.log(`Records with only first name: ${summary.onlyFirstName}`);
    
    if (summary.missingNames > 0) {
      console.log('\n⚠️ ISSUE FOUND: Names are missing because:');
      console.log('   1. The raw data stores job titles instead of person names');
      console.log('   2. Some entries are POSITIONS not actual people (e.g., "Defensive Analyst")');
      console.log('   3. The canonicalName field is empty in the database');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Done');
  }
}

analyzeSchoolChanges();