import * as cheerio from "cheerio";

export default async function tableSeparatorParser(html, url) {
  const $ = cheerio.load(html);
  
  // Check if this is the table with staff-directory_table class and table-separator rows
  if (!$('.staff-directory_table').length || 
      !$('.table-separator').length) {
    return null;
  }

  const staff = [];
  let currentCategory = "";

  // Process all rows in the tbody
  $('.staff-directory_table tbody tr').each((i, el) => {
    const $row = $(el);
    
    // Check if this is a category separator row
    if ($row.has('.table-separator').length || $row.find('td.table-separator').length) {
      currentCategory = $row.find('td').text().trim();
      return; // Continue to next row
    }
    
    // Check if this is a staff member row
    if ($row.hasClass('staff-directory_table_row')) {
      // Extract name
      let name = "";
      const nameLink = $row.find('.staff-directory_table_row_name a .name');
      if (nameLink.length) {
        name = nameLink.text().trim();
      } else {
        // Fallback: try to find name in other locations
        name = $row.find('.staff-directory_table_row_name').text().trim();
      }

      // Extract title
      let title = "";
      const titleCell = $row.find('.staff-directory_table_row_title');
      if (titleCell.length) {
        title = titleCell.find('p').text().trim() || titleCell.text().trim();
      }

      // Extract phone
      let phone = null;
      const phoneLink = $row.find('.staff-directory_table_row_phone a[href^="tel:"]');
      if (phoneLink.length) {
        phone = phoneLink.attr('href')?.replace('tel:', '') || phoneLink.text().trim();
      } else {
        // Fallback: check phone cell text directly
        const phoneText = $row.find('.staff-directory_table_row_phone').text().trim();
        if (phoneText && phoneText.match(/\(\d{3}\) \d{3}-\d{4}/)) {
          phone = phoneText;
        }
      }

      // Clean phone format if needed
      if (phone) {
        phone = phone.replace(/\s+/g, ' ').trim(); // Normalize spaces
      }

      // Extract email
      let email = null;
      const emailLink = $row.find('.staff-directory_table_row_email a[href^="mailto:"]');
      if (emailLink.length) {
        email = emailLink.attr('href')?.replace('mailto:', '') || emailLink.text().trim();
        // If email is empty string, set to null
        if (email === '') {
          email = null;
        }
      }

      // Only add if we have at least a name
      if (name && name !== '') {
        staff.push({ 
          name, 
          title: title || null, 
          email, 
          phone,
          category: currentCategory 
        });
      }
    }
  });

  return { staff };
}