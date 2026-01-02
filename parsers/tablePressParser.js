import * as cheerio from "cheerio";

export default async function tablePressParser(html, url) {
  const $ = cheerio.load(html);
  
  // Check if this page has tablepress tables
  if (!$('.tablepress').length) return null;

  const staff = [];
  let currentCategory = "";
  
  // Process each tablepress table
  $('.tablepress').each((tableIndex, table) => {
    const $table = $(table);
    currentCategory = ""; // Reset category for each table
    
    // Process each row in tbody
    $table.find('tbody tr').each((rowIndex, row) => {
      const $row = $(row);
      const $cells = $row.find('td');
      
      // Check if this is a category row (single cell with colspan or strong text)
      if ($cells.length === 1 || $row.find('td[colspan]').length > 0) {
        const cellText = $cells.text().trim();
        
        // Check if this is a category header (has strong/bold text)
        if (cellText && ($cells.find('strong').length > 0 || $cells.find('b').length > 0)) {
          currentCategory = cellText.replace(/[*_]/g, '').trim();
          console.log(`📁 Found category: ${currentCategory}`);
        }
        return; // Skip to next row
      }
      
      // Check if this is a regular staff row (should have 4 cells)
      if ($cells.length >= 4) {
        // Column 1: Name
        const name = $cells.eq(0).text().trim();
        
        // Column 2: Title/Position
        const title = $cells.eq(1).text().trim();
        
        // Column 3: Phone
        let phone = $cells.eq(2).text().trim();
        // Clean phone number
        if (phone) {
          phone = phone.replace(/\s+/g, ' ').trim();
        } else {
          phone = null;
        }
        
        // Column 4: Email
        let email = null;
        const emailLink = $cells.eq(3).find('a[href^="mailto:"]');
        if (emailLink.length) {
          email = emailLink.attr('href')?.replace('mailto:', '').trim();
        } else {
          // Try to extract email from text
          const emailText = $cells.eq(3).text().trim();
          const emailMatch = emailText.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
          if (emailMatch) {
            email = emailMatch[0];
          }
        }
        
        // Only add if we have at least a name
        if (name && name !== '') {
          staff.push({ 
            name, 
            title: title || null, 
            email, 
            phone,
            category: currentCategory || null
          });
        }
      }
    });
  });

  return staff.length > 0 ? { staff } : null;
}