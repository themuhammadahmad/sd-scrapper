import * as cheerio from "cheerio";
// https://www.vvc.edu/staff-directory
export default async function vvcTableParser(html, url) {
  const $ = cheerio.load(html);
  
  // Check if this is the VVC table format with wyswyg-table-wrap and h2 headers
  if (!$('.wyswyg-table-wrap').length || !$('h2').length) {
    return null;
  }

  const staff = [];
  let currentCategory = "";

  // Process each section (h2 followed by table)
  $('.field__item').children().each((i, el) => {
    const $el = $(el);
    
    // Check if this is a category header (h2)
    if ($el.is('h2')) {
      currentCategory = $el.text().trim();
      return; // Continue to next element
    }
    
    // Check if this is a table wrapper
    if ($el.is('.wyswyg-table-wrap')) {
      // Find the table inside the wrapper
      const $table = $el.find('table');
      
      if ($table.length) {
        // Process each row in the table body
        $table.find('tbody tr').each((j, rowEl) => {
          const $row = $(rowEl);
          const cells = $row.find('td');
          
          // Skip header rows and empty rows
          if (cells.length >= 4 && !$row.find('strong').length) {
            const name = $(cells[0]).text().trim();
            const title = $(cells[1]).text().trim();
            const phone = $(cells[2]).text().trim();
            const email = $(cells[3]).text().trim();
            
            // Skip empty rows and placeholder data
            if (name && name !== '&nbsp;' && name !== '') {
              // Clean up phone data
              let cleanedPhone = null;
              if (phone && phone !== '&nbsp;' && phone !== '--' && phone !== '') {
                cleanedPhone = phone;
              }
              
              // Clean up email data
              let cleanedEmail = null;
              if (email && email !== '&nbsp;' && email !== '--' && email !== '') {
                cleanedEmail = email;
              }
              
              staff.push({ 
                name, 
                title, 
                email: cleanedEmail, 
                phone: cleanedPhone,
                category: currentCategory 
              });
            }
          }
        });
      }
    }
  });

  return { staff };
}