import { readFileSync, writeFileSync } from 'fs';

// Read the JSON file
const rawData = readFileSync('fixed-directories-processed.json', 'utf8');
const data = JSON.parse(rawData);

// Create a map to group entries by staffDirectory
const staffDirMap = new Map();

// Group entries by staffDirectory
data.forEach(entry => {
    const staffDir = (entry.staffDirectory || '').trim();
    if (staffDir) {
        if (!staffDirMap.has(staffDir)) {
            staffDirMap.set(staffDir, []);
        }
        staffDirMap.get(staffDir).push(entry);
    }
});

// Process to find duplicates and select the best entry
const processedEntries = [];

staffDirMap.forEach((entries, staffDir) => {
    if (entries.length > 1) {
        // Find entries with valid ipeds (not empty string)
        const entriesWithIpeds = entries.filter(entry => {
            const ipeds = entry.ipeds;
            return ipeds !== undefined && 
                   ipeds !== null && 
                   ipeds !== '' && 
                   String(ipeds).trim() !== '';
        });
        
        if (entriesWithIpeds.length > 0) {
            // Keep the first entry with ipeds
            processedEntries.push(entriesWithIpeds[0]);
            
            // Also keep any additional entries with ipeds if they have different baseUrl
            for (let i = 1; i < entriesWithIpeds.length; i++) {
                const entry = entriesWithIpeds[i];
                if (entry.baseUrl !== entriesWithIpeds[0].baseUrl) {
                    processedEntries.push(entry);
                }
            }
        } else {
            // If none have ipeds, keep the first one
            processedEntries.push(entries[0]);
        }
    } else {
        // Only one entry with this staffDirectory
        processedEntries.push(entries[0]);
    }
});

// Write the processed data to a new file
writeFileSync(
    'fixed-directories-processed-cleaned.json',
    JSON.stringify(processedEntries, null, 2),
    'utf8'
);

// Print statistics
console.log(`Original entries: ${data.length}`);
console.log(`Processed entries: ${processedEntries.length}`);
console.log(`Entries removed: ${data.length - processedEntries.length}`);

// Show some examples of duplicates that were handled
console.log('\nExamples of duplicates handled:');
let duplicateCount = 0;
staffDirMap.forEach((entries, staffDir) => {
    if (entries.length > 1) {
        duplicateCount++;
        if (duplicateCount <= 5) { // Show first 5 examples
            console.log(`\nStaff Directory: ${staffDir}`);
            entries.forEach((entry, index) => {
                console.log(`  Entry ${index + 1}: baseUrl=${entry.baseUrl}, ipeds=${entry.ipeds || '(empty)'}`);
            });
        }
    }
});

console.log(`\nTotal duplicate staffDirectory groups found: ${duplicateCount}`);