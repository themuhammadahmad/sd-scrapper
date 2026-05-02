import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import ChangeLog from '../models/ChangeLog.js';

async function deleteAllChangeLogs() {
    try {
        if (!process.env.MONGODB_URI) {
            console.error("❌ MONGODB_URI not found in .env file");
            process.exit(1);
        }

        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("✅ Connected successfully\n");

        console.log("🗑️ Deleting ALL ChangeLog entries...");
        
        const result = await ChangeLog.deleteMany({});
        
        console.log(`✅ Successfully deleted ${result.deletedCount} ChangeLog entries.`);
        console.log("Your changes dashboard will now be completely empty until the May cycle runs and creates the new fresh ones!");

    } catch (error) {
        console.error("❌ Error:", error.message);
    } finally {
        await mongoose.disconnect();
    }
}

deleteAllChangeLogs();
