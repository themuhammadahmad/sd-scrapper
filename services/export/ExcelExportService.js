// services/export/ExcelExportService.js
import ExcelJS from 'exceljs';
import StaffProfile from '../../models/StaffProfile.js';
import StaffDirectory from '../../models/StaffDirectory.js';
import ChangeLog from '../../models/ChangeLog.js';
import Site from '../../models/Site.js';

import fs from 'fs-extra';
import path from 'path';

export class ExcelExportService {
  constructor() {
    this.exportDir = path.join(process.cwd(), 'data', 'exports');
    this.ensureExportDirectory();
  }

  ensureExportDirectory() {
    fs.ensureDirSync(this.exportDir);
  }

  /**
   * Get domain name from URL for school column
   */
  extractSchoolName(site) {
    if (!site || !site.baseUrl) return 'Unknown School';

    try {
      const url = new URL(site.baseUrl);
      const hostname = url.hostname;

      // Remove www and common TLDs
      let schoolName = hostname
        .replace(/^www\./, '')
        .replace(/\.(edu|com|org|net|gov|us|uk)$/i, '')
        .split('.')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      // Add "University" if not already in name
      if (!schoolName.toLowerCase().includes('university') &&
        !schoolName.toLowerCase().includes('college')) {
        schoolName += ' University';
      }

      return schoolName;
    } catch (error) {
      // If URL parsing fails, extract from baseUrl string
      const baseUrl = site.baseUrl;
      const domain = baseUrl.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
      return domain.replace('.', ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
  }

  /**
   * Generate Excel file matching the template format
   */
  async generateFullExport() {
    const directories = await StaffDirectory.find().lean();

    // Create quick lookup: baseUrl → ipeds
    const ipedsMap = new Map();
    directories.forEach(dir => {
      if (dir.baseUrl) {
        ipedsMap.set(dir.baseUrl, dir.ipeds || '');
      }
    });


    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `staff-profiles-${timestamp}.xlsx`;  // Includes time for uniqueness
    const filePath = path.join(this.exportDir, filename);

    console.log(`🚀 Generating full export: ${filename}`);

    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'University Directory System';
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet('Sheet1');

      // Set column headers EXACTLY as in template
      worksheet.columns = [
        { header: 'IPEDS/NCES ID', key: 'ipedsId', width: 15 },
        { header: 'School', key: 'school', width: 30 },
        { header: 'Unique ID', key: 'uniqueId', width: 15 },
        { header: 'Sport code', key: 'sportCode', width: 15 },
        { header: 'First name', key: 'firstName', width: 20 },
        { header: 'Last name', key: 'lastName', width: 20 },
        { header: 'Position', key: 'position', width: 25 },
        { header: 'Email address', key: 'email', width: 30 },
        { header: 'Phone number', key: 'phone', width: 20 },
        { header: 'Last Updated:', key: 'lastUpdated', width: 20 }
      ];

      // Style the header row (blue background, white text)
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF6ffEEA' } // Blue color
      };

      let totalRecords = 0;
      // const maxRecords = 10000;

      // Get all universities
      const universities = await Site.find().lean();

      // Process universities one by one
      for (const university of universities) {
        console.log(`📊 Processing ${this.extractSchoolName(university)}...`);

     // Get profiles for this university
const profiles = await StaffProfile.find({ site: university._id })
  .select('canonicalName emails phones fingerprint lastSeenAt updatedAt profileUrl raw title categories') // ✅ ADD 'categories' here
  .lean();

        console.log(`   Found ${profiles.length} profiles`);

        // If we're about to exceed 10k, break and create another file
        // if (totalRecords + profiles.length > maxRecords) {
        //   console.log(`⚠️  Reached 10k limit, will continue in next file`);
        //   break;
        // }

        for (const profile of profiles) {
          // Split canonicalName into first and last name
          let firstName = '';
          let lastName = '';
          if (profile.canonicalName) {
            const nameParts = profile.canonicalName.trim().split(' ');
            firstName = nameParts[0] || '';
            lastName = nameParts.slice(1).join(' ') || '';
          }

          // Get primary contact info
          const primaryEmail = profile.emails?.[0] || '';
          const primaryPhone = profile.phones?.[0] || '';

          // Get position (use raw title, or profile title, or default)
          const position = profile.raw?.title ||
            profile.title ||
            '(General Contact)';

          // Get IPEDS using baseUrl
          const ipedsId = ipedsMap.get(university.baseUrl) || '';

          // Join categories for sport code
          const sportCode = Array.isArray(profile.categories)
            ? profile.categories.join(', ')
            : '';

          // Add row matching template format
          worksheet.addRow({
            ipedsId: ipedsId || '', // Leave blank as we don't have this data
            school: this.extractSchoolName(university),
            uniqueId: profile.fingerprint || '',
            sportCode: sportCode || '', // Leave blank for now
            firstName: firstName,
            lastName: lastName,
            position: position,
            email: primaryEmail,
            phone: primaryPhone,
            lastUpdated: profile.updatedAt || profile.lastSeenAt || new Date()
          });

          totalRecords++;
        }

        // After processing each university, check if we've reached the limit
        // if (totalRecords >= maxRecords) {
        //   console.log(`🎯 Reached exactly ${maxRecords} records, stopping.`);
        //   break;
        // }
      }



      // Format date column
      worksheet.getColumn('lastUpdated').numFmt = 'yyyy-mm-dd hh:mm:ss';

      // Add some basic styling to data rows
      for (let i = 2; i <= worksheet.rowCount; i++) {
        const row = worksheet.getRow(i);
        // Alternate row colors for readability
        if (i % 2 === 0) {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF5F7FA' } // Very light gray
          };
        }
      }

      // Auto-fit columns
      worksheet.columns.forEach(column => {
        if (column.width) {
          column.width = Math.max(column.width, column.header.length + 2);
        }
      });

      // Save file
      await workbook.xlsx.writeFile(filePath);

      // Get file stats
      const stats = await fs.stat(filePath);

      console.log(`✅ Full export created: ${filename} (${totalRecords} records, ${this.formatFileSize(stats.size)})`);

      return {
        filename,
        filePath,
        recordCount: totalRecords,
        fileSize: stats.size,
        generatedAt: new Date()
      };

    } catch (error) {
      console.error('❌ Error generating full export:', error);
      throw error;
    }
  }
/**
 * Generate Excel file containing only changed staff profiles (full export)
 */
// async generateChangesExport() {
//   const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
//   const filename = `staff-changes-${timestamp}.xlsx`;
//   const filePath = path.join(this.exportDir, filename);

//   console.log(`🔄 Generating changes export: ${filename}`);

//   try {
//       // Get all change logs
//     let changeLogs = await ChangeLog.find({}).populate('site fromSnapshot toSnapshot')
//       .sort({ createdAt: -1 })
//       .lean();

//     console.log(`📊 Found ${changeLogs.length} change records`);

//     // Check if there are any changes at all
//     let totalChanges = 0;
//     for (const changeLog of changeLogs) {
//       totalChanges += (changeLog.added?.length || 0) + 
//                      (changeLog.removed?.length || 0) + 
//                      (changeLog.updated?.length || 0);
//     }

//      if (totalChanges === 0) {
//       console.log('⚠️ No changes found to export');
      
//       // Create a minimal workbook with a message
//       const workbook = new ExcelJS.Workbook();
//       workbook.creator = 'University Directory System - Changes Export';
//       workbook.created = new Date();

//       const worksheet = workbook.addWorksheet('No Changes');
      
//       // Add message
//       worksheet.addRow(['No changes detected']);
//       worksheet.addRow(['There are no recorded changes in the system yet.']);
//       worksheet.addRow(['Start scraping directories to track changes over time.']);
      
//       await workbook.xlsx.writeFile(filePath);
      
//       const stats = await fs.stat(filePath);
      
//       return {
//         filename,
//         filePath,
//         recordCount: 0,
//         fileSize: stats.size,
//         generatedAt: new Date(),
//         summary: {
//           changeLogs: changeLogs.length,
//           added: 0,
//           removed: 0,
//           updated: 0,
//           total: 0,
//           message: 'No changes found'
//         }
//       };
//     }


//     const workbook = new ExcelJS.Workbook();
//     workbook.creator = 'University Directory System - Changes Export';
//     workbook.created = new Date();

//     const worksheet = workbook.addWorksheet('Changed Staff');

//     // Columns for changes export
//     worksheet.columns = [
//       { header: 'Change Type', key: 'changeType', width: 15 },
//       { header: 'Change Date', key: 'changeDate', width: 20 },
//       { header: 'IPEDS/NCES ID', key: 'ipedsId', width: 15 },
//       { header: 'School', key: 'school', width: 30 },
//       { header: 'Unique ID', key: 'uniqueId', width: 20 },
//       { header: 'Sport code', key: 'sportCode', width: 20 },
//       { header: 'First name', key: 'firstName', width: 20 },
//       { header: 'Last name', key: 'lastName', width: 20 },
//       { header: 'Position', key: 'position', width: 25 },
//       { header: 'Email address', key: 'email', width: 30 },
//       { header: 'Phone number', key: 'phone', width: 20 },
//       { header: 'Change Details', key: 'changeDetails', width: 40 },
//       { header: 'Snapshot Period', key: 'snapshotPeriod', width: 30 }
//     ];

//     // Style the header row
//     const headerRow = worksheet.getRow(1);
//     headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
//     headerRow.fill = {
//       type: 'pattern',
//       pattern: 'solid',
//       fgColor: { argb: 'FF4CAF50' } // Green for changes
//     };

//     // Get all change logs (no date filters for full export)
//      changeLogs = await ChangeLog.find({})
//       .populate('site fromSnapshot toSnapshot')
//       .sort({ createdAt: -1 })
//       .lean();

//     console.log(`📊 Found ${changeLogs.length} change records`);

//     // Get directories for IPEDS mapping
//     const directories = await StaffDirectory.find().lean();
//     const ipedsMap = new Map();
//     directories.forEach(dir => {
//       if (dir.baseUrl) {
//         ipedsMap.set(dir.baseUrl, dir.ipeds || '');
//       }
//     });

//     let totalRecords = 0;

//     // Process each change log
//     for (const changeLog of changeLogs) {
//       const site = changeLog.site;
//       if (!site) continue;

//       const schoolName = this.extractSchoolName(site);
//       const ipedsId = ipedsMap.get(site.baseUrl) || '';

//       // Format snapshot period
//       const snapshotPeriod = changeLog.fromSnapshot && changeLog.toSnapshot 
//         ? `${new Date(changeLog.fromSnapshot.snapshotDate).toLocaleDateString()} → ${new Date(changeLog.toSnapshot.snapshotDate).toLocaleDateString()}`
//         : 'N/A';

//       const changeDate = new Date(changeLog.createdAt);

//       // Process ADDED staff
//       if (changeLog.added && changeLog.added.length > 0) {
//         for (const addedStaff of changeLog.added) {
//           const nameParts = (addedStaff.name || '').trim().split(' ');
//           const firstName = nameParts[0] || '';
//           const lastName = nameParts.slice(1).join(' ') || '';

//           // Get categories for sport code
//           const sportCode = Array.isArray(addedStaff.categories) 
//             ? addedStaff.categories.join(', ')
//             : '';

//           worksheet.addRow({
//             changeType: 'ADDED',
//             changeDate: changeDate,
//             ipedsId: ipedsId,
//             school: schoolName,
//             uniqueId: addedStaff.fingerprint || '',
//             sportCode: sportCode,
//             firstName: firstName,
//             lastName: lastName,
//             position: addedStaff.data?.title || addedStaff.data?.raw?.title || '',
//             email: Array.isArray(addedStaff.data?.emails) ? addedStaff.data.emails[0] : '',
//             phone: Array.isArray(addedStaff.data?.phones) ? addedStaff.data.phones[0] : '',
//             changeDetails: `Added to ${addedStaff.categories?.join(', ') || 'default'} category`,
//             snapshotPeriod: snapshotPeriod
//           });

//           totalRecords++;
//         }
//       }

//       // Process REMOVED staff
//       if (changeLog.removed && changeLog.removed.length > 0) {
//         for (const removedStaff of changeLog.removed) {
//           const nameParts = (removedStaff.name || '').trim().split(' ');
//           const firstName = nameParts[0] || '';
//           const lastName = nameParts.slice(1).join(' ') || '';

//           const sportCode = Array.isArray(removedStaff.categories) 
//             ? removedStaff.categories.join(', ')
//             : '';

//           worksheet.addRow({
//             changeType: 'REMOVED',
//             changeDate: changeDate,
//             ipedsId: ipedsId,
//             school: schoolName,
//             uniqueId: removedStaff.fingerprint || '',
//             sportCode: sportCode,
//             firstName: firstName,
//             lastName: lastName,
//             position: removedStaff.data?.title || removedStaff.data?.raw?.title || '',
//             email: Array.isArray(removedStaff.data?.emails) ? removedStaff.data.emails[0] : '',
//             phone: Array.isArray(removedStaff.data?.phones) ? removedStaff.data.phones[0] : '',
//             changeDetails: `Removed from ${removedStaff.categories?.join(', ') || 'default'} category`,
//             snapshotPeriod: snapshotPeriod
//           });

//           totalRecords++;
//         }
//       }

//       // Process UPDATED staff
//       if (changeLog.updated && changeLog.updated.length > 0) {
//         for (const updatedStaff of changeLog.updated) {
//           const nameParts = (updatedStaff.name || '').trim().split(' ');
//           const firstName = nameParts[0] || '';
//           const lastName = nameParts.slice(1).join(' ') || '';

//           // Extract change details
//           let changeDetails = '';
//           if (updatedStaff.diffs) {
//             const diffFields = Object.keys(updatedStaff.diffs);
//             changeDetails = diffFields.map(field => {
//               const diff = updatedStaff.diffs[field];
//               return `${field}: ${diff.before || 'N/A'} → ${diff.after || 'N/A'}`;
//             }).join('; ');
//           }

//           // Get sport code from current categories
//           const currentCategories = updatedStaff.after?.categories || updatedStaff.categories;
//           const sportCode = Array.isArray(currentCategories) 
//             ? currentCategories.join(', ')
//             : '';

//           worksheet.addRow({
//             changeType: 'UPDATED',
//             changeDate: changeDate,
//             ipedsId: ipedsId,
//             school: schoolName,
//             uniqueId: updatedStaff.fingerprint || '',
//             sportCode: sportCode,
//             firstName: firstName,
//             lastName: lastName,
//             position: updatedStaff.after?.title || updatedStaff.after?.raw?.title || '',
//             email: Array.isArray(updatedStaff.after?.emails) ? updatedStaff.after.emails[0] : '',
//             phone: Array.isArray(updatedStaff.after?.phones) ? updatedStaff.after.phones[0] : '',
//             changeDetails: changeDetails || 'Details not available',
//             snapshotPeriod: snapshotPeriod
//           });

//           totalRecords++;
//         }
//       }
//     }

//     // Apply conditional formatting based on change type
//     for (let i = 2; i <= worksheet.rowCount; i++) {
//       const row = worksheet.getRow(i);
//       const changeType = row.getCell('A').value; // Change Type column

//       // Color code rows based on change type
//       let color = 'FFFFFFFF'; // Default white
      
//       switch (changeType) {
//         case 'ADDED':
//           color = 'FFE8F5E9'; // Light green
//           break;
//         case 'REMOVED':
//           color = 'FFFCE4EC'; // Light red
//           break;
//         case 'UPDATED':
//           color = 'FFF3E5F5'; // Light purple
//           break;
//       }

//       row.fill = {
//         type: 'pattern',
//         pattern: 'solid',
//         fgColor: { argb: color }
//       };
//     }

//     // Format date column
//     worksheet.getColumn('changeDate').numFmt = 'yyyy-mm-dd hh:mm:ss';

//     // Auto-fit columns
//     worksheet.columns.forEach(column => {
//       if (column.key === 'changeDetails' || column.key === 'snapshotPeriod') {
//         column.width = 40; // Wider for details
//       } else if (column.width) {
//         column.width = Math.max(column.width, column.header.length + 2);
//       }
//     });

//     // Add a summary worksheet
//     const summarySheet = workbook.addWorksheet('Summary');
    
//     // Summary stats
//     const addedCount = changeLogs.reduce((sum, log) => sum + (log.added?.length || 0), 0);
//     const removedCount = changeLogs.reduce((sum, log) => sum + (log.removed?.length || 0), 0);
//     const updatedCount = changeLogs.reduce((sum, log) => sum + (log.updated?.length || 0), 0);
    
//     summarySheet.columns = [
//       { header: 'Metric', key: 'metric', width: 25 },
//       { header: 'Value', key: 'value', width: 20 }
//     ];

//     summarySheet.addRow({ metric: 'Total Change Records', value: changeLogs.length });
//     summarySheet.addRow({ metric: 'Staff Added', value: addedCount });
//     summarySheet.addRow({ metric: 'Staff Removed', value: removedCount });
//     summarySheet.addRow({ metric: 'Staff Updated', value: updatedCount });
//     summarySheet.addRow({ metric: 'Total Changed Staff', value: totalRecords });
//     summarySheet.addRow({ metric: 'Export Generated', value: new Date().toLocaleString() });

//     // Save the workbook
//     await workbook.xlsx.writeFile(filePath);

//     // Get file stats
//     const stats = await fs.stat(filePath);

//     console.log(`✅ Changes export created: ${filename} (${totalRecords} changed staff records)`);

//     return {
//       filename,
//       filePath,
//       recordCount: totalRecords,
//       fileSize: stats.size,
//       generatedAt: new Date(),
//       summary: {
//         changeLogs: changeLogs.length,
//         added: addedCount,
//         removed: removedCount,
//         updated: updatedCount,
//         total: totalRecords
//       }
//     };

//   } catch (error) {
//     console.error('❌ Error generating changes export:', error);
//     throw error;
//   }
// }
async generateChangesExport() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `staff-changes-${timestamp}.xlsx`;
  const filePath = path.join(this.exportDir, filename);

  console.log(`🔄 Generating changes export: ${filename}`);

  try {
    // Get all change logs
    let changeLogs = await ChangeLog.find({})
      .populate('site fromSnapshot toSnapshot')
      .sort({ createdAt: -1 })
      .lean();

    console.log(`📊 Found ${changeLogs.length} change records`);

    // Check if there are any changes at all
    let totalChanges = 0;
    for (const changeLog of changeLogs) {
      totalChanges += (changeLog.added?.length || 0) + 
                     (changeLog.removed?.length || 0) + 
                     (changeLog.updated?.length || 0);
    }

    if (totalChanges === 0) {
      console.log('⚠️ No changes found to export');
      
      // Create a minimal workbook with a message
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'University Directory System - Changes Export';
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet('No Changes');
      
      // Add message
      worksheet.addRow(['No changes detected']);
      worksheet.addRow(['There are no recorded changes in the system yet.']);
      worksheet.addRow(['Start scraping directories to track changes over time.']);
      
      await workbook.xlsx.writeFile(filePath);
      
      const stats = await fs.stat(filePath);
      
      return {
        filename,
        filePath,
        recordCount: 0,
        fileSize: stats.size,
        generatedAt: new Date(),
        summary: {
          changeLogs: changeLogs.length,
          added: 0,
          removed: 0,
          updated: 0,
          total: 0,
          message: 'No changes found'
        }
      };
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'University Directory System - Changes Export';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Changed Staff');

    // Columns for changes export
    worksheet.columns = [
      { header: 'Change Type', key: 'changeType', width: 15 },
      { header: 'Change Date', key: 'changeDate', width: 20 },
      { header: 'IPEDS/NCES ID', key: 'ipedsId', width: 15 },
      { header: 'School', key: 'school', width: 30 },
      { header: 'Unique ID', key: 'uniqueId', width: 20 },
      { header: 'Sport code', key: 'sportCode', width: 20 },
      { header: 'First name', key: 'firstName', width: 20 },
      { header: 'Last name', key: 'lastName', width: 20 },
      { header: 'Position', key: 'position', width: 25 },
      { header: 'Email address', key: 'email', width: 30 },
      { header: 'Phone number', key: 'phone', width: 20 },
      { header: 'Change Details', key: 'changeDetails', width: 40 },
      { header: 'Snapshot Period', key: 'snapshotPeriod', width: 30 }
    ];

    // Style the header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4CAF50' } // Green for changes
    };

    // Get directories for IPEDS mapping
    const directories = await StaffDirectory.find().lean();
    const ipedsMap = new Map();
    directories.forEach(dir => {
      if (dir.baseUrl) {
        ipedsMap.set(dir.baseUrl, dir.ipeds || '');
      }
    });

    let totalRecords = 0;

    // Helper function to extract name parts
    const extractNameParts = (staffRecord) => {
      // Try to get name from different possible locations
      let fullName = '';
      
      // Priority 1: Direct name property
      if (staffRecord.name) {
        fullName = staffRecord.name;
      }
      // Priority 2: Name from data object
      else if (staffRecord.data?.name) {
        fullName = staffRecord.data.name;
      }
      // Priority 3: First/last from data object
      else if (staffRecord.data?.firstName || staffRecord.data?.lastName) {
        fullName = `${staffRecord.data.firstName || ''} ${staffRecord.data.lastName || ''}`.trim();
      }
      // Priority 4: First/last from raw data
      else if (staffRecord.data?.raw?.firstName || staffRecord.data?.raw?.lastName) {
        fullName = `${staffRecord.data.raw.firstName || ''} ${staffRecord.data.raw.lastName || ''}`.trim();
      }
      
      const nameParts = fullName.trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      return { firstName, lastName, fullName };
    };

    // Helper function to get position
    const getPosition = (staffRecord) => {
      return staffRecord.data?.title || 
             staffRecord.data?.raw?.title || 
             staffRecord.title || 
             '';
    };

    // Helper function to get email
    const getEmail = (staffRecord) => {
      if (Array.isArray(staffRecord.data?.emails) && staffRecord.data.emails.length > 0) {
        return staffRecord.data.emails[0];
      }
      if (Array.isArray(staffRecord.emails) && staffRecord.emails.length > 0) {
        return staffRecord.emails[0];
      }
      if (staffRecord.data?.email) {
        return staffRecord.data.email;
      }
      return '';
    };

    // Helper function to get phone
    const getPhone = (staffRecord) => {
      if (Array.isArray(staffRecord.data?.phones) && staffRecord.data.phones.length > 0) {
        return staffRecord.data.phones[0];
      }
      if (Array.isArray(staffRecord.phones) && staffRecord.phones.length > 0) {
        return staffRecord.phones[0];
      }
      if (staffRecord.data?.phone) {
        return staffRecord.data.phone;
      }
      return '';
    };

    // Helper function to get categories/sport codes
    const getSportCode = (staffRecord) => {
      const categories = staffRecord.categories || staffRecord.data?.categories;
      if (Array.isArray(categories)) {
        return categories.join(', ');
      }
      return '';
    };

    // Helper function to get fingerprint/unique ID
    const getUniqueId = (staffRecord) => {
      return staffRecord.fingerprint || staffRecord.data?.fingerprint || '';
    };

    // Process each change log
    for (const changeLog of changeLogs) {
      const site = changeLog.site;
      if (!site) continue;

      const schoolName = this.extractSchoolName(site);
      const ipedsId = ipedsMap.get(site.baseUrl) || '';

      // Format snapshot period
      const snapshotPeriod = changeLog.fromSnapshot && changeLog.toSnapshot 
        ? `${new Date(changeLog.fromSnapshot.snapshotDate).toLocaleDateString()} → ${new Date(changeLog.toSnapshot.snapshotDate).toLocaleDateString()}`
        : 'N/A';

      const changeDate = new Date(changeLog.createdAt);

      // Process ADDED staff
      if (changeLog.added && changeLog.added.length > 0) {
        for (const addedStaff of changeLog.added) {
          const { firstName, lastName } = extractNameParts(addedStaff);
          const sportCode = getSportCode(addedStaff);

          worksheet.addRow({
            changeType: 'ADDED',
            changeDate: changeDate,
            ipedsId: ipedsId,
            school: schoolName,
            uniqueId: getUniqueId(addedStaff),
            sportCode: sportCode,
            firstName: firstName,
            lastName: lastName,
            position: getPosition(addedStaff),
            email: getEmail(addedStaff),
            phone: getPhone(addedStaff),
            changeDetails: `Added to ${sportCode || 'default'} category`,
            snapshotPeriod: snapshotPeriod
          });

          totalRecords++;
        }
      }

      // Process REMOVED staff
      if (changeLog.removed && changeLog.removed.length > 0) {
        for (const removedStaff of changeLog.removed) {
          const { firstName, lastName } = extractNameParts(removedStaff);
          const sportCode = getSportCode(removedStaff);

          worksheet.addRow({
            changeType: 'REMOVED',
            changeDate: changeDate,
            ipedsId: ipedsId,
            school: schoolName,
            uniqueId: getUniqueId(removedStaff),
            sportCode: sportCode,
            firstName: firstName,
            lastName: lastName,
            position: getPosition(removedStaff),
            email: getEmail(removedStaff),
            phone: getPhone(removedStaff),
            changeDetails: `Removed from ${sportCode || 'default'} category`,
            snapshotPeriod: snapshotPeriod
          });

          totalRecords++;
        }
      }

      // Process UPDATED staff - FIXED VERSION
      if (changeLog.updated && changeLog.updated.length > 0) {
        for (const updatedStaff of changeLog.updated) {
          // For UPDATED records, we need to check the structure
          // It should have 'before' and 'after' properties
          
          let staffData = updatedStaff.after || updatedStaff; // Try 'after' first, then the object itself
          
          const { firstName, lastName } = extractNameParts(staffData);
          const sportCode = getSportCode(staffData);

          // Extract change details from diffs
          let changeDetails = '';
          if (updatedStaff.diffs) {
            const diffFields = Object.keys(updatedStaff.diffs);
            changeDetails = diffFields.map(field => {
              const diff = updatedStaff.diffs[field];
              return `${field}: ${diff.before || 'N/A'} → ${diff.after || 'N/A'}`;
            }).join('; ');
          } else if (updatedStaff.before && updatedStaff.after) {
            // If no diffs but we have before/after, create a simple change message
            const changedFields = [];
            
            // Compare common fields
            const fields = ['name', 'title', 'categories', 'emails', 'phones'];
            fields.forEach(field => {
              const beforeVal = updatedStaff.before[field] || updatedStaff.before.data?.[field];
              const afterVal = updatedStaff.after[field] || updatedStaff.after.data?.[field];
              
              if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
                changedFields.push(field);
              }
            });
            
            if (changedFields.length > 0) {
              changeDetails = `Updated fields: ${changedFields.join(', ')}`;
            }
          }

          worksheet.addRow({
            changeType: 'UPDATED',
            changeDate: changeDate,
            ipedsId: ipedsId,
            school: schoolName,
            uniqueId: getUniqueId(staffData),
            sportCode: sportCode,
            firstName: firstName,
            lastName: lastName,
            position: getPosition(staffData),
            email: getEmail(staffData),
            phone: getPhone(staffData),
            changeDetails: changeDetails || 'Details not available',
            snapshotPeriod: snapshotPeriod
          });

          totalRecords++;
        }
      }
    }

    // Apply conditional formatting based on change type
    for (let i = 2; i <= worksheet.rowCount; i++) {
      const row = worksheet.getRow(i);
      const changeType = row.getCell('A').value; // Change Type column

      // Color code rows based on change type
      let color = 'FFFFFFFF'; // Default white
      
      switch (changeType) {
        case 'ADDED':
          color = 'FFE8F5E9'; // Light green
          break;
        case 'REMOVED':
          color = 'FFFCE4EC'; // Light red
          break;
        case 'UPDATED':
          color = 'FFF3E5F5'; // Light purple
          break;
      }

      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: color }
      };
    }

    // Format date column
    worksheet.getColumn('changeDate').numFmt = 'yyyy-mm-dd hh:mm:ss';

    // Auto-fit columns
    worksheet.columns.forEach(column => {
      if (column.key === 'changeDetails' || column.key === 'snapshotPeriod') {
        column.width = 40; // Wider for details
      } else if (column.width) {
        column.width = Math.max(column.width, column.header.length + 2);
      }
    });

    // Add a summary worksheet
    const summarySheet = workbook.addWorksheet('Summary');
    
    // Summary stats
    const addedCount = changeLogs.reduce((sum, log) => sum + (log.added?.length || 0), 0);
    const removedCount = changeLogs.reduce((sum, log) => sum + (log.removed?.length || 0), 0);
    const updatedCount = changeLogs.reduce((sum, log) => sum + (log.updated?.length || 0), 0);
    
    summarySheet.columns = [
      { header: 'Metric', key: 'metric', width: 25 },
      { header: 'Value', key: 'value', width: 20 }
    ];

    summarySheet.addRow({ metric: 'Total Change Records', value: changeLogs.length });
    summarySheet.addRow({ metric: 'Staff Added', value: addedCount });
    summarySheet.addRow({ metric: 'Staff Removed', value: removedCount });
    summarySheet.addRow({ metric: 'Staff Updated', value: updatedCount });
    summarySheet.addRow({ metric: 'Total Changed Staff', value: totalRecords });
    summarySheet.addRow({ metric: 'Export Generated', value: new Date().toLocaleString() });

    // Save the workbook
    await workbook.xlsx.writeFile(filePath);

    // Get file stats
    const stats = await fs.stat(filePath);

    console.log(`✅ Changes export created: ${filename} (${totalRecords} changed staff records)`);

    return {
      filename,
      filePath,
      recordCount: totalRecords,
      fileSize: stats.size,
      generatedAt: new Date(),
      summary: {
        changeLogs: changeLogs.length,
        added: addedCount,
        removed: removedCount,
        updated: updatedCount,
        total: totalRecords
      }
    };

  } catch (error) {
    console.error('❌ Error generating changes export:', error);
    throw error;
  }
}
  /**
   * Generate export for single university (simple, not batched)
   */
  async generateUniversityExport(siteId) {
    const site = await Site.findById(siteId).lean();

    if (!site) {
      throw new Error('University not found');
    }

    // Fetch StaffDirectory to get IPEDS
    const directory = await StaffDirectory.findOne({ baseUrl: site.baseUrl }).lean();
    const ipedsId = directory?.ipeds || '';

    const schoolName = this.extractSchoolName(site);
    const safeSchoolName = schoolName.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `staff-profiles-${safeSchoolName}-${timestamp}.xlsx`;
    const filePath = path.join(this.exportDir, filename);

    console.log(`🎓 Generating export for ${schoolName}: ${filename}`);

    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'University Directory System';

      const worksheet = workbook.addWorksheet('Sheet1');

      // Columns (template-aligned)
      worksheet.columns = [
        { header: 'IPEDS/NCES ID', key: 'ipedsId', width: 15 },
        { header: 'School', key: 'school', width: 30 },
        { header: 'Unique ID', key: 'uniqueId', width: 15 },
        { header: 'Sport code', key: 'sportCode', width: 20 },
        { header: 'First name', key: 'firstName', width: 20 },
        { header: 'Last name', key: 'lastName', width: 20 },
        { header: 'Position', key: 'position', width: 25 },
        { header: 'Email address', key: 'email', width: 30 },
        { header: 'Phone number', key: 'phone', width: 20 },
        { header: 'Last Updated:', key: 'lastUpdated', width: 20 }
      ];

      // Header styling
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF667EEA' }
      };

      // 🟡 FIX: Add 'categories' to the select query
      const profiles = await StaffProfile.find({ site: siteId })
        .select('canonicalName emails phones fingerprint lastSeenAt updatedAt raw title categories')
        .lean();

      console.log(`   Found ${profiles.length} profiles`);

      for (let i = 0; i < profiles.length; i++) {
        const profile = profiles[i];

        // Name split
        let firstName = '';
        let lastName = '';
        if (profile.canonicalName) {
          const parts = profile.canonicalName.trim().split(' ');
          firstName = parts[0] || '';
          lastName = parts.slice(1).join(' ') || '';
        }

        // Contact info
        const primaryEmail = profile.emails?.[0] || '';
        const primaryPhone = profile.phones?.[0] || '';
        const position = profile.raw?.title || profile.title || '(General Contact)';

        // 🟡 FIX: Convert categories array to sport code string
        const sportCode = Array.isArray(profile.categories) && profile.categories.length > 0
          ? profile.categories.join(', ') // Join multiple categories with comma
          : ''; // Leave empty if no categories

        worksheet.addRow({
          ipedsId,
          school: schoolName,
          uniqueId: profile.fingerprint || '',
          sportCode, // ✅ Now using categories as sport code
          firstName,
          lastName,
          position,
          email: primaryEmail,
          phone: primaryPhone,
          lastUpdated: profile.updatedAt || profile.lastSeenAt || new Date()
        });

        // Alternate row color
        if (i % 2 === 0) {
          worksheet.getRow(i + 2).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF5F7FA' }
          };
        }
      }

      // Date format
      worksheet.getColumn('lastUpdated').numFmt = 'yyyy-mm-dd hh:mm:ss';

      // Auto-fit
      worksheet.columns.forEach(col => {
        col.width = Math.max(col.width, col.header.length + 2);
      });

      await workbook.xlsx.writeFile(filePath);

      const stats = await fs.stat(filePath);

      console.log(`✅ University export created: ${filename} (${profiles.length} records)`);

      return {
        filename,
        filePath,
        universityId: site._id,
        universityName: schoolName,
        recordCount: profiles.length,
        fileSize: stats.size,
        generatedAt: new Date()
      };

    } catch (error) {
      console.error(`❌ Error generating export for ${siteId}:`, error);
      throw error;
    }
  }


  /**
   * Format file size for display
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}