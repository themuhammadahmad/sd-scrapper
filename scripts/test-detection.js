// scripts/test-detection.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { createTestSnapshots } from '../utils/test-snapshots.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

async function runTest() {
    if (!MONGODB_URI) {
        console.error('❌ MONGODB_URI is not defined in .env');
        process.exit(1);
    }

    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected.');

        // Run the test
        const results = await createTestSnapshots();

        console.log('\n--- TEST RESULTS ---');
        
        // Calculate allPassed based on scenario results
        const allPassed = Object.values(results.scenarios).every(v => v === true);
        
        console.log(`Overall Status: ${allPassed ? '✅ PASSED' : '❌ FAILED'}`);
        console.log(`Added Count: ${results.counts.added}`);
        console.log(`Removed Count: ${results.counts.removed}`);
        console.log(`Updated Count: ${results.counts.updated}`);

        console.log('\nScenario Details:');
        Object.entries(results.scenarios).forEach(([name, passed]) => {
            console.log(`- ${name.replace(/_/g, ' ')}: ${passed ? '✅' : '❌'}`);
        });

        if (results.counts.updated > 0) {
            console.log('\nDetailed Updates:');
            results.details.updated.forEach(u => {
                console.log(`  • ${u.name}: ${Object.keys(u.diffs || {}).join(', ')}`);
            });
        }

        console.log('\n--------------------\n');

    } catch (error) {
        console.error('❌ Error running test:', error);
    } finally {
        await mongoose.connection.close();
        console.log('🔌 Connection closed.');
    }
}

runTest();
