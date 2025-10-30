import * as cheerio from "cheerio";

export default async function sectionStaffDirectoryParser(html, url) {
  const $ = cheerio.load(html);

  // Alternative approach: look for any sections that contain staff directory tables
  let staff = [];

  // Find all sections that might contain staff directories
  $('section').each((i, section) => {
    const $section = $(section);
    
    // Check if this section has the staff-directory class or contains staff directory structure
    const hasStaffDirectoryClass = $section.hasClass('staff-directory');
    const hasStaffTable = $section.find('table').length > 0;
    const hasStaffRows = $section.find('tbody tr').length > 0;
    
    if (hasStaffDirectoryClass || (hasStaffTable && hasStaffRows)) {
      // Extract category from h2 or aria-label
      let category = $section.find('h2').first().text().trim();
      if (!category) {
        category = $section.attr('aria-label') || 'Unknown Category';
      }


      // Process each table in this section
      $section.find('table').each((j, table) => {
        const $table = $(table);
        
        $table.find('tbody tr').each((k, row) => {
          const $row = $(row);
          const $cells = $row.find('td');
          
          if ($cells.length >= 4) {
            // Extract data from cells
            const name = $cells.eq(0).text().trim() || $cells.eq(0).find('a').text().trim();
            const title = $cells.eq(1).text().trim();
            let phone = $cells.eq(2).text().trim();
            phone = phone && phone !== '' ? phone : null;
            
            let email = null;
            const emailLink = $cells.eq(3).find('a[href^="mailto:"]');
            if (emailLink.length) {
              email = emailLink.attr('href')?.replace('mailto:', '');
            }

            if (name && name !== '') {
              staff.push({
                name,
                title: title || null,
                email,
                phone,
                category
              });
            }
          }
        });
      });
    }
  });

  return staff.length > 0 ? { staff } : null;
}