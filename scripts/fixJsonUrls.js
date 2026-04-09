import fs from 'fs-extra';
import path from 'path';

async function fixUrls() {
    const filePath = path.join(process.cwd(), 'all_sports_websites.json');
    console.log(`Processing ${filePath}...`);

    try {
        const data = await fs.readJson(filePath);
        
        const ensureProtocol = (url) => {
            if (!url) return url;
            const trimmed = url.trim();
            if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
            if (trimmed.startsWith('//')) return `https:${trimmed}`;
            return `https://${trimmed}`;
        };

        const updatedData = data.map(item => {
            // Fix staffDirectory as requested
            if (item.staffDirectory) {
                item.staffDirectory = ensureProtocol(item.staffDirectory);
            }
            
            // Also fix other URL fields for robustness
            if (item.baseUrl) item.baseUrl = ensureProtocol(item.baseUrl);
            if (item.collegeWebsite) item.collegeWebsite = ensureProtocol(item.collegeWebsite);
            if (item.athleticWebsite) item.athleticWebsite = ensureProtocol(item.athleticWebsite);

            return item;
        });

        await fs.writeJson(filePath, updatedData, { spaces: 2 });
        console.log(`✅ Successfully updated protocols in ${data.length} records.`);
    } catch (err) {
        console.error('❌ Error fixing URLs:', err);
    }
}

fixUrls();
