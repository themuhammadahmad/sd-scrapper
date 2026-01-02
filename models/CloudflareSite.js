// models/CloudflareSite.js
import mongoose from 'mongoose';

const cloudflareSiteSchema = new mongoose.Schema({
  baseUrl: { type: String, required: true, index: true },
  staffDirectory: { type: String, required: true, unique: true },
  firstDetected: { type: Date, default: Date.now },
  lastDetected: { type: Date, default: Date.now },
  detectionCount: { type: Number, default: 1 },
  alwaysProtected: { type: Boolean, default: false },
  bypassMethod: { type: String, enum: ['puppeteer', 'fetch', 'none', null], default: null },
  lastSuccessWith: { type: String, enum: ['puppeteer', 'fetch', null], default: null }
}, { timestamps: true });

// Update this after successful scrape
export async function updateCloudflareTracking(baseUrl, staffDirectory, methodUsed, cloudflareDetected) {
  const CloudflareSite = mongoose.model('CloudflareSite');
  
  if (cloudflareDetected) {
    await CloudflareSite.findOneAndUpdate(
      { staffDirectory },
      {
        baseUrl,
        staffDirectory,
        lastDetected: new Date(),
        $inc: { detectionCount: 1 },
        alwaysProtected: true,
        lastSuccessWith: methodUsed
      },
      { upsert: true, new: true }
    );
  } else {
    // If we succeeded without Cloudflare, maybe remove or update
    await CloudflareSite.findOneAndUpdate(
      { staffDirectory },
      {
        baseUrl,
        staffDirectory,
        lastSuccessWith: methodUsed,
        bypassMethod: methodUsed
      },
      { upsert: true, new: true }
    );
  }
}

export default mongoose.model('CloudflareSite', cloudflareSiteSchema);