import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function fixStaffDirectoryUrls() {
    try {
        // Read the file
        const filePath = path.join(__dirname, 'merged-directories.json');
        const directories = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        
        console.log(`📋 Found ${directories.length} directories to check`);
        
        let fixedCount = 0;
        const fixedDirectories = [];
        
        // Process each directory
        for (const dir of directories) {
            if (!dir.baseUrl || !dir.staffDirectory) {
                fixedDirectories.push(dir);
                continue;
            }
            
            const baseUrl = dir.baseUrl;
            const staffDir = dir.staffDirectory;
            const originalStaffDir = staffDir;
            
            // Check if baseUrl ends with slash, if not add it for the pattern
            const baseUrlWithSlash = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
            
            // Create the pattern: baseUrl + "/www"
            const pattern = baseUrlWithSlash + 'www';
            
            // Check if this pattern exists in staffDirectory
            if (staffDir.includes(pattern)) {
                // Find where the pattern ends
                const patternEndIndex = staffDir.indexOf(pattern) + pattern.length;
                
                // Get everything from the end of the pattern
                // Remove the baseUrl part including the "www"
                let fixedStaffDir = staffDir.substring(patternEndIndex - 4); // -4 to keep "www."
                
                // Ensure it has protocol
                if (!fixedStaffDir.startsWith('http')) {
                    fixedStaffDir = 'https://' + fixedStaffDir;
                }
                
                console.log(`\n🔄 Fixed:`);
                console.log(`   Base: ${baseUrl}`);
                console.log(`   From: ${originalStaffDir}`);
                console.log(`   To:   ${fixedStaffDir}`);
                
                fixedCount++;
                
                fixedDirectories.push({
                    ...dir,
                    staffDirectory: fixedStaffDir
                });
            } else {
                // No change needed
                fixedDirectories.push(dir);
            }
        }
        
        console.log(`\n✅ Fixing complete!`);
        console.log(`📊 Fixed ${fixedCount} out of ${directories.length} directories`);
        
        // Save the fixed file
        const fixedFilePath = path.join(__dirname, 'merged-directories-fixed-clean.json');
        fs.writeFileSync(fixedFilePath, JSON.stringify(fixedDirectories, null, 2));
        
        console.log(`📁 Fixed file saved: ${fixedFilePath}`);
        
        // Show summary
        if (fixedCount > 0) {
            console.log(`\n📝 Example fixes:`);
            // Show first 5 fixes
            for (let i = 0; i < Math.min(fixedCount, 5); i++) {
                const originalDir = directories.find(d => 
                    d.baseUrl === fixedDirectories[i].baseUrl && 
                    d.staffDirectory !== fixedDirectories[i].staffDirectory
                );
                if (originalDir) {
                    console.log(`   From: ${originalDir.staffDirectory}`);
                    console.log(`   To:   ${fixedDirectories[i].staffDirectory}`);
                    console.log('');
                }
            }
        } else {
            console.log(`\n⚠️ No URLs matched the pattern. Let me check what's happening...`);
            
            // Check first 10 to see patterns
            console.log(`\n🔍 Checking first 10 entries:`);
            directories.slice(0, 10).forEach((dir, i) => {
                const baseWithSlash = dir.baseUrl.endsWith('/') ? dir.baseUrl : dir.baseUrl + '/';
                const pattern = baseWithSlash + 'www';
                const hasPattern = dir.staffDirectory.includes(pattern);
                
                console.log(`${i + 1}. ${dir.baseUrl}`);
                console.log(`   Staff: ${dir.staffDirectory}`);
                console.log(`   Pattern "${pattern}": ${hasPattern ? '✅ FOUND' : '❌ NOT FOUND'}`);
                console.log('');
            });
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

// Run the script
fixStaffDirectoryUrls();