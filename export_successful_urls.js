import mongoose from "mongoose";
import exceljs from "exceljs";
import dotenv from "dotenv";
import StaffDirectory from "./models/StaffDirectory.js";

// Load config
dotenv.config();

// Fallback to the exact string if .env doesn't load properly for the script
const uri = process.env.MONGODB_URI || "mongodb+srv://learnFirstAdmin:mT4aOUQ8IeZlGqf6@khareedofrokht.h4nje.mongodb.net/universities?retryWrites=true&w=majority&appName=khareedofrokht";

async function exportSuccessfulURLs() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(uri);
        console.log("Connected to MongoDB successfully.");

        console.log("Fetching URLs that succeeded in their LAST scrape...");

        // parserFailedLastTime: false means the last scrape was successful
        const sites = await StaffDirectory.find({ parserFailedLastTime: false }).lean();

        console.log(`Found ${sites.length} last-successful sites.`);

        if (sites.length === 0) {
            console.log("No successfully scraped sites found.");
            return;
        }

        const workbook = new exceljs.Workbook();
        const sheet = workbook.addWorksheet("Successful URLs");

        // Set up columns
        sheet.columns = [
            { header: "Base URL", key: "baseUrl", width: 45 },
            { header: "Staff Directory URL", key: "staffDirectory", width: 65 },
            { header: "School Name", key: "schoolName", width: 35 },
            { header: "Successful Parser", key: "successfulParser", width: 25 },
            { header: "Last Staff Count", key: "lastStaffCount", width: 18 },
            { header: "Last Processed At", key: "lastProcessedAt", width: 30 },
        ];

        // Make headers bold
        sheet.getRow(1).font = { bold: true };

        // Add rows
        sites.forEach(site => {
            sheet.addRow({
                baseUrl: site.baseUrl,
                staffDirectory: site.staffDirectory,
                schoolName: site.schoolName || "N/A",
                successfulParser: site.successfulParser || "N/A",
                lastStaffCount: site.lastStaffCount,
                lastProcessedAt: site.lastProcessedAt
                    ? new Date(site.lastProcessedAt).toLocaleString()
                    : "N/A",
            });
        });

        // Save file
        const fileName = "successful_urls_export.xlsx";
        await workbook.xlsx.writeFile(fileName);
        console.log(`\n✅ Done! ${sites.length} URLs saved to: ${fileName}`);

    } catch (error) {
        console.error("❌ Error:", error);
    } finally {
        await mongoose.disconnect();
        console.log("MongoDB connection closed.");
    }
}

exportSuccessfulURLs();
