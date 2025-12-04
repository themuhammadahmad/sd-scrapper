// services/export/ExcelExportService.js
import ExcelJS from 'exceljs';
import StaffProfile from '../../models/StaffProfile.js';
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
          .select('canonicalName emails phones fingerprint lastSeenAt updatedAt profileUrl raw title')
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

          // Add row matching template format
          worksheet.addRow({
            ipedsId: '', // Leave blank as we don't have this data
            school: this.extractSchoolName(university),
            uniqueId: profile.fingerprint || '',
            sportCode: '', // Leave blank for now
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
   * Generate export for single university (simple, not batched)
   */
  async generateUniversityExport(siteId) {
    const site = await Site.findById(siteId);
    if (!site) {
      throw new Error('University not found');
    }

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

      // Set column headers matching template
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

      // Style header
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF667EEA' }
      };

      // Get all profiles for this university
      const profiles = await StaffProfile.find({ site: siteId })
        .select('canonicalName emails phones fingerprint lastSeenAt updatedAt profileUrl raw title')
        .lean();

      console.log(`   Found ${profiles.length} profiles`);

      for (let i = 0; i < profiles.length; i++) {
        const profile = profiles[i];
        
        // Split name
        let firstName = '';
        let lastName = '';
        if (profile.canonicalName) {
          const nameParts = profile.canonicalName.trim().split(' ');
          firstName = nameParts[0] || '';
          lastName = nameParts.slice(1).join(' ') || '';
        }

        // Get contact info
        const primaryEmail = profile.emails?.[0] || '';
        const primaryPhone = profile.phones?.[0] || '';
        const position = profile.raw?.title || profile.title || '(General Contact)';

        worksheet.addRow({
          ipedsId: '',
          school: schoolName,
          uniqueId: profile.fingerprint || '',
          sportCode: '',
          firstName,
          lastName,
          position,
          email: primaryEmail,
          phone: primaryPhone,
          lastUpdated: profile.updatedAt || profile.lastSeenAt || new Date()
        });

        // Alternate row colors
        if (i % 2 === 0) {
          const row = worksheet.getRow(i + 2); // +2 for header row
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF5F7FA' }
          };
        }
      }

      // Format date column
      worksheet.getColumn('lastUpdated').numFmt = 'yyyy-mm-dd hh:mm:ss';

      // Auto-fit columns
      worksheet.columns.forEach(column => {
        if (column.width) {
          column.width = Math.max(column.width, column.header.length + 2);
        }
      });

      await workbook.xlsx.writeFile(filePath);
      
      // Get file stats
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