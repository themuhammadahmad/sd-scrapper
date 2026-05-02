import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import StaffDirectory from '../models/StaffDirectory.js';

async function testOldFiltering() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        
        const directories = await StaffDirectory.find({ isActive: true }).lean();
        
        // Exact logic from current schedulerService.js
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        
        console.log(`Current Server Time: ${now.toISOString()}`);
        console.log(`Current Year: ${currentYear}, Current Month: ${currentMonth}`);
        
        let skippedCount = 0;
        let notSkippedCount = 0;
        
        // Just for our info: Let's see some dates
        const sampleDates = [];

        directories.forEach(directory => {
            if (!directory.lastProcessedAt) {
                notSkippedCount++;
                return;
            }

            const lastProcessed = new Date(directory.lastProcessedAt);
            const lastYear = lastProcessed.getFullYear();
            const lastMonth = lastProcessed.getMonth();

            const wasProcessedThisMonth = (lastYear === currentYear && lastMonth === currentMonth);
            
            if (wasProcessedThisMonth) {
                skippedCount++;
            } else {
                notSkippedCount++;
                if (sampleDates.length < 5) {
                    sampleDates.push({
                        url: directory.baseUrl,
                        lastProcessed: lastProcessed.toISOString(),
                        lastMonth: lastMonth,
                        lastYear: lastYear
                    });
                }
            }
        });
        
        console.log(`\nUsing old code logic (Server UTC Time):`);
        console.log(`Skipped (Processed this month): ${skippedCount}`);
        console.log(`NOT Skipped: ${notSkippedCount}`);
        
        if (notSkippedCount > 0) {
            console.log(`\nSample of NOT Skipped dates:`);
            console.table(sampleDates);
        }
        
    } catch (error) {
        console.error(error);
    } finally {
        await mongoose.disconnect();
    }
}

testOldFiltering();
