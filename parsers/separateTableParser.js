import * as cheerio from "cheerio";

export default async function separateTableParser(html, url) {
  const $ = cheerio.load(html);
  
  // Check if this is the table-based Sidearm template
  if (!$('.s-table-header').length && !$('table').length) {
    return null;
  }

  const staff = [];

  // Process each table as a separate category
  $('table').each((tableIndex, tableEl) => {
    const $table = $(tableEl);
    
    // Extract category from table header
    let category = "";
    const categoryHeader = $table.find('.s-table-header__row--heading th[colspan]').first();
    if (categoryHeader.length) {
      category = categoryHeader.text().trim();
    } else {
      // Fallback: use table index if no category found
      category = `Category ${tableIndex + 1}`;
    }

    // Process each row in the table body
    $table.find('.s-table-body__row').each((rowIndex, rowEl) => {
      const $row = $(rowEl);
      
      // Extract name from the second column (usually contains name link)
      const nameLink = $row.find('td:nth-child(2) a span.s-text-regular-bold');
      const name = nameLink.length ? nameLink.text().trim() : 
                   $row.find('td:nth-child(2)').text().trim();
      
      // Extract title from the third column
      const title = $row.find('td:nth-child(3)').text().trim();
      
      // Extract email from mailto links
      let email = null;
      const emailLink = $row.find('a[href^="mailto:"]');
      if (emailLink.length) {
        email = emailLink.attr('href')?.replace('mailto:', '') || null;
      }
      
      // Extract phone - look for phone numbers in the phone column
      let phone = null;
      const phoneCell = $row.find('td:nth-child(5)'); // Usually 5th column for phone
      if (phoneCell.length) {
        phone = phoneCell.text().trim();
        // Clean up phone number
        if (phone && !phone.match(/^\d{3}-\d{3}-\d{4}$/) && phone.match(/\d/)) {
          // Extract just the digits and format
          const digits = phone.replace(/\D/g, '');
          if (digits.length === 10) {
            phone = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
          }
        }
        // If phone is empty after cleaning, set to null
        if (!phone || phone === '' || !phone.match(/\d/)) {
          phone = null;
        }
      }

      // Only add if we have at least a name
      if (name && name !== '' && name !== '- Vacant -') {
        staff.push({ 
          name, 
          title, 
          email, 
          phone,
          category 
        });
      }
    });
  });

  return { staff };
}