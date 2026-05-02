import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name to correctly find the .env file in the root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Import the StaffDirectory model
import StaffDirectory from '../models/StaffDirectory.js';

const getNYTime = (dateObj) => {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: 'numeric' // gives 1-12
    });
    const parts = formatter.formatToParts(dateObj);
    return {
        month: parseInt(parts.find(p => p.type === 'month').value, 10),
        year: parseInt(parts.find(p => p.type === 'year').value, 10)
    };
};

async function checkUnscraped() {
    try {
        if (!process.env.MONGODB_URI) {
            console.error("❌ MONGODB_URI not found in .env file");
            process.exit(1);
        }

        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("✅ Connected successfully\n");
        
        // Fetch all active directories
        const directories = await StaffDirectory.find({ isActive: true }).lean();
        const { year: currentYear, month: currentMonth } = getNYTime(new Date());
        
        let unscrapedCount = 0;
        let scrapedCount = 0;
        
        for (const dir of directories) {
            // If it has never been processed, it's definitely unscraped
            if (!dir.lastProcessedAt) {
                unscrapedCount++;
                continue;
            }
            
            // Check its last processed date in New York time
            const { year: lastYear, month: lastMonth } = getNYTime(new Date(dir.lastProcessedAt));
            
            if (lastYear === currentYear && lastMonth === currentMonth) {
                scrapedCount++;
            } else {
                unscrapedCount++;
            }
        }
        
        console.log(`📊 Scraping Status for Current NY Month (${currentMonth}/${currentYear}):`);
        console.log(`====================================================`);
        console.log(`Total Active Directories : ${directories.length}`);
        console.log(`✅ Scraped this month    : ${scrapedCount}`);
        console.log(`⏳ NOT scraped yet       : ${unscrapedCount}`);
        console.log(`====================================================\n`);
        
    } catch (error) {
        console.error("❌ Error:", error.message);
    } finally {
        await mongoose.disconnect();
    }
}

checkUnscraped();
