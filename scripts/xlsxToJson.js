import ExcelJS from 'exceljs';
import fs from 'fs-extra';
import path from 'path';

async function convertXlsxToJson() {
    const inputFile = 'All Sports Athletic Websites.xlsx';
    const outputFile = 'all_sports_websites.json';

    console.log(`Reading ${inputFile}...`);

    try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(inputFile);
        const worksheet = workbook.getWorksheet(1);

        const data = [];

        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // Skip header

            const getCellValue = (cell) => {
                if (!cell) return '';
                if (typeof cell === 'object') {
                    return cell.text || cell.result || cell.toString() || '';
                }
                return String(cell);
            };

            const ipeds = getCellValue(row.getCell(1).value);
            const sportsCode = getCellValue(row.getCell(2).value);
            const schoolName = getCellValue(row.getCell(3).value);
            const collegeWebsite = getCellValue(row.getCell(4).value);
            const athleticWebsite = getCellValue(row.getCell(5).value);
            const staffDirectory = getCellValue(row.getCell(6).value);

            if (schoolName) {
                data.push({
                    baseUrl: collegeWebsite,
                    staffDirectory: staffDirectory,
                    ipeds: ipeds,
                    schoolName: schoolName,
                    athleticWebsite: athleticWebsite,
                    collegeWebsite: collegeWebsite,
                    sportsCode: sportsCode
                });
            }
        });

        console.log(`Found ${data.length} records.`);
        await fs.outputJson(outputFile, data, { spaces: 2 });
        console.log(`✅ Successfully saved to ${outputFile}`);

    } catch (error) {
        console.error('❌ Error during conversion:', error);
    }
}

convertXlsxToJson();
