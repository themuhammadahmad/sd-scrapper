import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import StaffDirectory from '../models/StaffDirectory.js';
import Site from '../models/Site.js';

async function findSite() {
    try {
        const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/temporary";
        console.log("Connecting to", uri);
        await mongoose.connect(uri);
        
        const siteId = '69d7f16d58ec950f1bece208';
        console.log(`\n🔍 Searching Site for ID: ${siteId}`);
        const site = await Site.findById(siteId).lean();
        console.log("Site:", JSON.stringify(site, null, 2));

        if (site) {
            const dir = await StaffDirectory.findOne({ baseUrl: site.baseUrl }).lean();
            console.log("StaffDirectory entry:", JSON.stringify(dir, null, 2));
        }
    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

findSite();
