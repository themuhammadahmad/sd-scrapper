import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import dotenv from 'dotenv';
import path from 'path';

// Import models
import ChangeLog from './models/ChangeLog.js';
import Site from './models/Site.js';
import Snapshot from './models/Snapshot.js';
import StaffDirectory from './models/StaffDirectory.js';

dotenv.config();

const MONGODB_URI = "mongodb://localhost:27017/temporary";

// Helper functions (mirrored from ExcelExportService.js)
function extractSchoolName(site) {
    if (!site || !site.baseUrl) return 'Unknown School';
    try {
        const url = new URL(site.baseUrl);
        const hostname = url.hostname;
        let schoolName = hostname
            .replace(/^www\./, '')
            .replace(/\.(edu|com|org|net|gov|us|uk)$/i, '')
            .split('.')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
        if (!schoolName.toLowerCase().includes('university') && !schoolName.toLowerCase().includes('college')) {
            schoolName += ' University';
        }
        return schoolName;
    } catch (error) {
        const baseUrl = site.baseUrl;
        const domain = baseUrl.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
        return domain.replace('.', ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
}

function extractNameParts(staffRecord) {
    let fullName = '';
    if (staffRecord.name) fullName = staffRecord.name;
    else if (staffRecord.data?.name) fullName = staffRecord.data.name;
    else if (staffRecord.data?.firstName || staffRecord.data?.lastName) {
        fullName = `${staffRecord.data.firstName || ''} ${staffRecord.data.lastName || ''}`.trim();
    }
    const nameParts = fullName.trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    return { firstName, lastName };
}

async function exportChanges() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(MONGODB_URI);
        console.log("✅ Connected.");

        console.log("Fetching change logs...");
        const changeLogs = await ChangeLog.find({})
            .populate('site fromSnapshot toSnapshot')
            .sort({ createdAt: -1 })
            .lean();

        if (changeLogs.length === 0) {
            console.log("❌ No change logs found.");
            return;
        }

        console.log(`📊 Found ${changeLogs.length} change logs. Generating Excel...`);

        // Get directory mapping for IPEDS
        const directories = await StaffDirectory.find().lean();
        const ipedsMap = new Map();
        directories.forEach(dir => {
            if (dir.baseUrl) ipedsMap.set(dir.baseUrl, dir.ipeds || '');
        });

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Changed Staff');

        worksheet.columns = [
            { header: 'Change Type', key: 'changeType', width: 15 },
            { header: 'Change Date', key: 'changeDate', width: 22 },
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

        // Format header
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4CAF50' }
        };

        let rowCount = 0;

        for (const log of changeLogs) {
            if (!log.site) continue;

            const schoolName = extractSchoolName(log.site);
            const ipedsId = ipedsMap.get(log.site.baseUrl) || '';
            const changeDate = new Date(log.createdAt);
            const snapshotPeriod = (log.fromSnapshot && log.toSnapshot)
                ? `${new Date(log.fromSnapshot.snapshotDate).toLocaleDateString()} -> ${new Date(log.toSnapshot.snapshotDate).toLocaleDateString()}`
                : 'N/A';

            // ADDED
            if (log.added?.length > 0) {
                log.added.forEach(staff => {
                    const { firstName, lastName } = extractNameParts(staff);
                    worksheet.addRow({
                        changeType: 'n', // n = new person
                        changeDate,
                        ipedsId,
                        school: schoolName,
                        uniqueId: staff.fingerprint || '',
                        sportCode: staff.categories?.join(', ') || '',
                        firstName,
                        lastName,
                        position: staff.data?.title || staff.data?.raw?.title || staff.title || '',
                        email: (Array.isArray(staff.data?.emails) ? staff.data.emails[0] : staff.email) || '',
                        phone: (Array.isArray(staff.data?.phones) ? staff.data.phones[0] : staff.phone) || '',
                        changeDetails: `Added to ${staff.categories?.join(', ') || 'default'}`,
                        snapshotPeriod
                    });
                    rowCount++;
                });
            }

            // REMOVED
            if (log.removed?.length > 0) {
                log.removed.forEach(staff => {
                    const { firstName, lastName } = extractNameParts(staff);
                    worksheet.addRow({
                        changeType: 'r', // r = removed
                        changeDate,
                        ipedsId,
                        school: schoolName,
                        uniqueId: staff.fingerprint || '',
                        sportCode: staff.categories?.join(', ') || '',
                        firstName,
                        lastName,
                        position: staff.data?.title || staff.data?.raw?.title || staff.title || '',
                        email: (Array.isArray(staff.data?.emails) ? staff.data.emails[0] : staff.email) || '',
                        phone: (Array.isArray(staff.data?.phones) ? staff.data.phones[0] : staff.phone) || '',
                        changeDetails: `Removed from ${staff.categories?.join(', ') || 'default'}`,
                        snapshotPeriod
                    });
                    rowCount++;
                });
            }

            // UPDATED
            if (log.updated?.length > 0) {
                log.updated.forEach(update => {
                    const staff = update.after || update;
                    const { firstName, lastName } = extractNameParts(staff);

                    let changeDetails = '';
                    let codes = new Set();
                    if (update.diffs) {
                        changeDetails = Object.keys(update.diffs).map(field => {
                            const d = update.diffs[field];
                            
                            // Map codes based on fields
                            if (field === 'title' || field === 'name') codes.add('j');
                            if (field === 'emails') codes.add('e');
                            if (field === 'phones') codes.add('#');
                            if (field === 'categories') codes.add('a');
                            
                            return `${field}: ${d.before || 'N/A'} -> ${d.after || 'N/A'}`;
                        }).join('; ');
                    }

                    // For updates not mapping to specific codes, default to 'a' if it's generic
                    const finalCode = codes.size > 0 ? Array.from(codes).join('') : 'a';

                    worksheet.addRow({
                        changeType: finalCode,
                        changeDate,
                        ipedsId,
                        school: schoolName,
                        uniqueId: staff.fingerprint || '',
                        sportCode: staff.categories?.join(', ') || '',
                        firstName,
                        lastName,
                        position: staff.data?.title || staff.data?.raw?.title || staff.title || '',
                        email: (Array.isArray(staff.data?.emails) ? staff.data.emails[0] : staff.email) || '',
                        phone: (Array.isArray(staff.data?.phones) ? staff.data.phones[0] : staff.phone) || '',
                        changeDetails: changeDetails || 'Updated',
                        snapshotPeriod
                    });
                    rowCount++;
                });
            }
        }

        // Apply conditional formatting for row colors
        for (let i = 2; i <= worksheet.rowCount; i++) {
            const row = worksheet.getRow(i);
            const type = row.getCell(1).value;
            let color = 'FFFFFFFF';
            if (type === 'n') color = 'FFE8F5E9'; // Light green for new
            if (type === 'r') color = 'FFFCE4EC'; // Light red for removed
            if (/[jae#]/.test(type)) color = 'FFF3E5F5'; // Light purple for updates
            row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
        }

        const fileName = 'recent_changes.xlsx';
        await workbook.xlsx.writeFile(fileName);
        console.log(`\n✅ Done! Exported ${rowCount} changes to ${fileName}`);

    } catch (error) {
        console.error("❌ Error:", error);
    } finally {
        await mongoose.disconnect();
    }
}

exportChanges();
