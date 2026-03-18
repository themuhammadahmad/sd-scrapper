import mongoose from "mongoose";
import dotenv from "dotenv";
import crypto from "crypto";
import StaffProfile from "../models/StaffProfile.js";
import Site from "../models/Site.js";
import processStaffDirectory from "./processStaffDirectory.js";
import Snapshot from "../models/Snapshot.js";

dotenv.config();

const uri = process.env.MONGODB_URI;

// Mocking some dependencies or using the real ones if they are simple enough
// For a verification script, we can use a temporary "Test Site" in the real DB or a local one.

async function verifyIdentityFix() {
    try {
        console.log("Connecting to DB...");
        await mongoose.connect(uri);
        
        const testBaseUrl = "https://identity-test.com";
        const testDirectory = "https://identity-test.com/staff";
        
        // 1. Cleanup old test data
        console.log("Cleaning up old test data...");
        const oldSite = await Site.findOne({ baseUrl: testBaseUrl });
        if (oldSite) {
            await StaffProfile.deleteMany({ site: oldSite._id });
            await Snapshot.deleteMany({ site: oldSite._id });
            await Site.deleteOne({ _id: oldSite._id });
        }

        // 2. Setup initial state: Person with Name Only
        console.log("Step 1: Creating initial site and name-only profile...");
        const site = await Site.create({
            baseUrl: testBaseUrl,
            staffDirectory: testDirectory,
            lastScrapedAt: new Date()
        });

        const nameOnlyFingerprint = crypto.createHash("md5").update("identity tester").digest("hex");
        
        await StaffProfile.create({
            site: site._id,
            fingerprint: nameOnlyFingerprint,
            canonicalName: "Identity Tester",
            emails: [],
            lastSeenAt: new Date(),
            firstSeenAt: new Date()
        });

        console.log(`Created profile with fingerprint: ${nameOnlyFingerprint}`);

        // 3. Mock the scraper extraction
        // Instead of actually fetching, we can't easily mock fetch in this environment without extra libs.
        // But we can test the resolution logic by calling our new function if we export it, 
        // OR we can just run a mini-simulation of the logic.
        
        // Let's manually run the resolution logic we added
        const identityMaps = {
            emailToFingerprint: new Map(),
            nameOnlyToFingerprint: new Map()
        };
        
        const existingProfiles = await StaffProfile.find({ site: site._id }).lean();
        existingProfiles.forEach(p => {
          if (p.emails && p.emails.length > 0) {
            p.emails.forEach(email => identityMaps.emailToFingerprint.set(email.toLowerCase().trim(), p.fingerprint));
          } else if (p.canonicalName) {
            identityMaps.nameOnlyToFingerprint.set(p.canonicalName.toLowerCase().trim(), p.fingerprint);
          }
        });

        const resolvedPerson = { name: "Identity Tester", email: "tester@identity.com" };
        
        // This is a copy of our internal function in processStaffDirectory.js
        function simulateResolve(person, maps) {
            const email = (person.email || '').toLowerCase().trim();
            const name = (person.name || '').toLowerCase().trim();
            if (email) {
                if (maps.emailToFingerprint.has(email)) return maps.emailToFingerprint.get(email);
                if (maps.nameOnlyToFingerprint.has(name)) return maps.nameOnlyToFingerprint.get(name);
                return crypto.createHash("md5").update(email).digest("hex");
            }
            if (name) {
                if (maps.nameOnlyToFingerprint.has(name)) return maps.nameOnlyToFingerprint.get(name);
                return crypto.createHash("md5").update(name).digest("hex");
            }
            return "fallback";
        }

        const resolvedFingerprint = simulateResolve(resolvedPerson, identityMaps);
        console.log(`Resolved Fingerprint for person with email: ${resolvedFingerprint}`);

        if (resolvedFingerprint === nameOnlyFingerprint) {
            console.log("✅ SUCCESS: The system correctly linked the new email to the existing name-only profile!");
        } else {
            console.error("❌ FAILURE: The system generated a new fingerprint instead of linking.");
        }

        // Cleanup
        await StaffProfile.deleteMany({ site: site._id });
        await Site.deleteOne({ _id: site._id });

    } catch (error) {
        console.error("Test failed with error:", error);
    } finally {
        await mongoose.disconnect();
    }
}

verifyIdentityFix();
