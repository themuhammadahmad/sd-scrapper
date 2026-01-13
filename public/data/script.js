// const fs = require('fs');
import fs from "fs";
import path from "path"
import { fileURLToPath } from 'url';
const dirname = path.dirname
const __dirname = dirname(fileURLToPath(import.meta.url));


/**
 * Safely fix double slashes in URLs without using URL constructor
 */
function fixDoubleSlashes(url) {
  if (!url || typeof url !== 'string') return url;
  
  // Handle special case: if URL starts with // (protocol-relative URL)
  if (url.startsWith('//')) {
    // Add https: to make it parseable, then fix
    return 'https:' + url.replace(/\/+/g, '/');
  }
  
  // Extract protocol if exists
  const protocolMatch = url.match(/^(https?:\/\/)/i);
  
  if (protocolMatch) {
    const protocol = protocolMatch[0];
    const rest = url.substring(protocol.length);
    
    // Replace all consecutive slashes with single slash in rest of URL
    const fixedRest = rest.replace(/\/+/g, '/');
    
    return protocol + fixedRest;
  } else {
    // No protocol, just fix slashes
    return url.replace(/\/+/g, '/');
  }
}

/**
 * Check if a URL is valid
 */
function isValidUrl(string) {
  try {
    // Try to create a URL object
    new URL(string);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Try to fix malformed URLs
 */
function tryToFixUrl(url) {
  if (!url || typeof url !== 'string') return url;
  
  let fixed = url.trim();
  
  // If starts with www. but no protocol
  if (fixed.startsWith('www.')) {
    fixed = 'https://' + fixed;
  }
  
  // If starts with athletics. but no protocol
  if (fixed.startsWith('athletics.') && !fixed.startsWith('http')) {
    fixed = 'https://' + fixed;
  }
  
  // If missing protocol but has domain
  if (!fixed.startsWith('http') && fixed.includes('.') && !fixed.includes('://')) {
    fixed = 'https://' + fixed;
  }
  
  return fixed;
}

/**
 * Process the fixed-directories.json file
 */
function processDirectories() {
  try {
    // Read the JSON file
    const filePath = path.join(__dirname, 'fixed-directories.json');
    console.log(`📖 Reading file: ${filePath}`);
    
    const rawData = fs.readFileSync(filePath, 'utf8');
    let directories = JSON.parse(rawData);
    
    console.log(`📊 Original entries: ${directories.length}`);
    
    // Step 1: Fix all URLs and track issues
    const processed = [];
    const invalidUrls = [];
    const malformedUrls = [];
    
    for (let i = 0; i < directories.length; i++) {
      const dir = directories[i];
      const processedDir = { ...dir };
      
      // Fix staffDirectory URL
      if (processedDir.staffDirectory && typeof processedDir.staffDirectory === 'string') {
        const originalUrl = processedDir.staffDirectory.trim();
        
        // First try to fix malformed URLs
        let fixedUrl = tryToFixUrl(originalUrl);
        
        // Then fix double slashes
        fixedUrl = fixDoubleSlashes(fixedUrl);
        
        // Check if URL is valid
        if (!isValidUrl(fixedUrl)) {
          invalidUrls.push({
            index: i,
            schoolName: processedDir.schoolName,
            original: originalUrl,
            fixed: fixedUrl
          });
          
          // Still use the fixed version even if invalid
          processedDir.staffDirectory = fixedUrl;
        } else {
          processedDir.staffDirectory = fixedUrl;
          
          // Track if we made any changes
          if (originalUrl !== fixedUrl) {
            malformedUrls.push({
              index: i,
              schoolName: processedDir.schoolName,
              original: originalUrl,
              fixed: fixedUrl
            });
          }
        }
      }
      
      processed.push(processedDir);
    }
    
    console.log(`\n🔧 URL Fixing Results:`);
    console.log(`   Fixed ${malformedUrls.length} malformed URLs`);
    console.log(`   Found ${invalidUrls.length} invalid URLs (will keep them as-is)`);
    
    if (malformedUrls.length > 0) {
      console.log(`\n   Examples of fixed URLs:`);
      malformedUrls.slice(0, 3).forEach((item, idx) => {
        console.log(`   ${idx + 1}. ${item.schoolName}`);
        console.log(`      Before: ${item.original}`);
        console.log(`      After:  ${item.fixed}`);
      });
    }
    
    // Step 2: Remove duplicates based on staffDirectory
    console.log('\n🔍 Looking for duplicate staffDirectory entries...');
    
    const seen = new Map();
    const uniqueDirectories = [];
    const duplicatesRemoved = [];
    
    for (const dir of processed) {
      const staffDir = dir.staffDirectory;
      
      if (!staffDir) {
        uniqueDirectories.push(dir);
        continue;
      }
      
      // Normalize the URL for comparison (lowercase, remove trailing slashes)
      const normalizedStaffDir = staffDir.toLowerCase().replace(/\/+$/, '');
      
      if (!seen.has(normalizedStaffDir)) {
        // First time seeing this staffDirectory
        seen.set(normalizedStaffDir, dir);
        uniqueDirectories.push(dir);
      } else {
        // Duplicate found
        const existing = seen.get(normalizedStaffDir);
        
        // Determine which one to keep
        const existingHasIpeds = existing.ipeds && existing.ipeds.trim() !== '';
        const newHasIpeds = dir.ipeds && dir.ipeds.trim() !== '';
        
        if (existingHasIpeds && !newHasIpeds) {
          // Keep existing (has IPEDS)
          duplicatesRemoved.push(dir);
        } else if (!existingHasIpeds && newHasIpeds) {
          // Keep new one (has IPEDS), replace existing
          const existingIndex = uniqueDirectories.findIndex(d => d === existing);
          if (existingIndex > -1) {
            uniqueDirectories.splice(existingIndex, 1);
            duplicatesRemoved.push(existing);
          }
          seen.set(normalizedStaffDir, dir);
          uniqueDirectories.push(dir);
        } else {
          // Both have IPEDS or both don't - keep first, remove second
          duplicatesRemoved.push(dir);
        }
      }
    }
    
    console.log(`\n📊 Duplicate Removal Results:`);
    console.log(`   Duplicates found: ${duplicatesRemoved.length}`);
    
    if (duplicatesRemoved.length > 0) {
      console.log(`\n   Examples of removed duplicates:`);
      duplicatesRemoved.slice(0, 3).forEach((dir, idx) => {
        const matching = uniqueDirectories.find(d => 
          d.staffDirectory && dir.staffDirectory && 
          d.staffDirectory.toLowerCase().replace(/\/+$/, '') === 
          dir.staffDirectory.toLowerCase().replace(/\/+$/, '')
        );
        console.log(`   ${idx + 1}. ${dir.schoolName}`);
        console.log(`      URL: ${dir.staffDirectory}`);
        console.log(`      IPEDS: ${dir.ipeds || 'empty'}`);
        if (matching) {
          console.log(`      Kept instead: ${matching.schoolName} (IPEDS: ${matching.ipeds || 'empty'})`);
        }
      });
    }
    
    // Final results
    console.log(`\n📈 Final Statistics:`);
    console.log(`   Original entries: ${directories.length}`);
    console.log(`   After processing: ${uniqueDirectories.length}`);
    console.log(`   Removed entries: ${duplicatesRemoved.length}`);
    
    // Write the processed data back to file
    const outputPath = path.join(__dirname, 'fixed-directories-processed.json');
    fs.writeFileSync(outputPath, JSON.stringify(uniqueDirectories, null, 2), 'utf8');
    
    console.log(`\n✅ Processed file saved: ${outputPath}`);
    
    // Save removed duplicates for reference
    if (duplicatesRemoved.length > 0) {
      const removedPath = path.join(__dirname, 'removed-duplicates.json');
      fs.writeFileSync(removedPath, JSON.stringify(duplicatesRemoved, null, 2), 'utf8');
      console.log(`📝 Removed duplicates saved: ${removedPath}`);
    }
    
    // Save invalid URLs for review
    if (invalidUrls.length > 0) {
      const invalidPath = path.join(__dirname, 'invalid-urls.json');
      fs.writeFileSync(invalidPath, JSON.stringify(invalidUrls, null, 2), 'utf8');
      console.log(`⚠️  Invalid URLs saved for review: ${invalidPath}`);
    }
    
    // Check for remaining double slashes
    const remainingDoubleSlashes = uniqueDirectories.filter(dir => 
      dir.staffDirectory && dir.staffDirectory.includes('//')
    );
    
    if (remainingDoubleSlashes.length > 0) {
      console.log(`\n❌ WARNING: ${remainingDoubleSlashes.length} entries still have double slashes:`);
      remainingDoubleSlashes.slice(0, 5).forEach((dir, i) => {
        console.log(`   ${i + 1}. ${dir.schoolName}`);
        console.log(`      URL: ${dir.staffDirectory}`);
      });
    } else {
      console.log(`\n✅ All double slashes have been fixed!`);
    }
    
    return {
      processed: uniqueDirectories,
      removed: duplicatesRemoved,
      outputFile: outputPath
    };
    
  } catch (error) {
    console.error('❌ Error processing file:', error.message);
    console.error('Stack trace:', error.stack);
    
    if (error.code === 'ENOENT') {
      console.error(`File not found. Please make sure 'fixed-directories.json' exists in the same directory.`);
    } else if (error instanceof SyntaxError) {
      console.error(`Invalid JSON file. Please check the format of 'fixed-directories.json'.`);
    }
    
    process.exit(1);
  }
}

// Run the script
console.log('🚀 Starting directory processing...\n');
processDirectories();
console.log('\n🎉 Processing complete!');