import fs from "fs"

// File path
const filePath = './data/staff0-directories.json';

try {
  // Read and parse the file
  const data = fs.readFileSync(filePath, 'utf8');
  const directories = JSON.parse(data);

  // Count entries
  const totalCount = directories.length;
  console.log(`Total directories: ${totalCount}`, directories[0]);

  // Check for duplicates using a map
  const directoryMap = new Map();

  directories.forEach(entry => {
    const dir = entry.staffDirectory;
    if (directoryMap.has(dir)) {
      directoryMap.set(dir, directoryMap.get(dir) + 1);
    } else {
      directoryMap.set(dir, 1);
    }
  });

  // Find duplicates
  const duplicates = Array.from(directoryMap.entries()).filter(([_, count]) => count > 1);

  if (duplicates.length > 0) {
    console.log('Duplicate staffDirectory URLs found:');
    duplicates.forEach(([url, count]) => {
      console.log(`- ${url} appears ${count} times`);
    });
  } else {
    console.log('No duplicate staffDirectory URLs found.');
  }

} catch (error) {
  console.error('Error reading or parsing the file:', error.message);
}
