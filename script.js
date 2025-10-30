const fs = require('fs');
const path = require('path');

function generateFlatStructure() {
    const scriptName = path.basename(__filename);
    const outputFile = 'directory_structure.txt';
    
    function scanDir(dir, results = []) {
        const items = fs.readdirSync(dir);
        
        for (const item of items) {
            const fullPath = path.join(dir, item);
            const relativePath = path.relative(process.cwd(), fullPath);
            
            // Skip node_modules and this script
            if (item === 'node_modules' || relativePath === scriptName) {
                continue;
            }
            
            results.push(relativePath);
            
            if (fs.statSync(fullPath).isDirectory()) {
                scanDir(fullPath, results);
            }
        }
        
        return results;
    }
    
    const structure = scanDir(process.cwd());
    fs.writeFileSync(outputFile, structure.sort().join('\n'));
    console.log(`Directory structure saved to ${outputFile}`);
}

generateFlatStructure();