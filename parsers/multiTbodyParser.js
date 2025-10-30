import * as cheerio from "cheerio";

export default async function multiTbodyParser(html, url) {
  const $ = cheerio.load(html);
  
  // Check if this is the multi-tbody staff directory table
  if (!$('.staff-directory-table__table').length || 
      !$('.staff-directory-table-department').length) {
    return null;
  }

  const staff = [];

  // Process each tbody (each represents a department/category)
  $('.staff-directory-table-department').each((tbodyIndex, tbodyEl) => {
    const $tbody = $(tbodyEl);
    
    // Extract category from the department header row
    let category = "";
    const categoryRow = $tbody.find('.staff-directory-table-department__head').first();
    if (categoryRow.length) {
      category = categoryRow.find('.staff-directory-table-department__title span').text().trim() || 
                 categoryRow.find('.staff-directory-table-department__title').text().trim();
    }
    
    // If no category found in header, try to find it elsewhere or use fallback
    if (!category) {
      category = `Department ${tbodyIndex + 1}`;
    }

    // Process each staff member row in this tbody
    $tbody.find('.staff-directory-table-member-position').each((rowIndex, rowEl) => {
      const $row = $(rowEl);
      
      // Skip if this is actually a department header row
      if ($row.hasClass('staff-directory-table-department__head')) {
        return;
      }

      // Extract name from the name column
      const nameLink = $row.find('.staff-directory-table-member-position__name a');
      let name = nameLink.length ? nameLink.text().trim() : 
                 $row.find('.staff-directory-table-member-position__name').text().trim();
      
      // Clean up name - remove any image alt text that might be included
      name = name.replace(/\[.*?\]/g, '').trim();

      // Extract title from position column
      const titleCell = $row.find('.staff-directory-table-member-position__position');
      let title = titleCell.find('p').text().trim() || titleCell.text().trim();

      // Extract email
      let email = null;
      const emailLink = $row.find('.staff-directory-table-member-position__email a[href^="mailto:"]');
      if (emailLink.length) {
        email = emailLink.attr('href')?.replace('mailto:', '') || null;
      }

      // Extract phone
      let phone = null;
      const phoneLink = $row.find('.staff-directory-table-member-position__phone a[href^="tel:"]');
      if (phoneLink.length) {
        phone = phoneLink.attr('href')?.replace('tel:', '') || null;
      } else {
        // Fallback: check if there's phone text directly in the cell
        const phoneText = $row.find('.staff-directory-table-member-position__phone').text().trim();
        if (phoneText && phoneText.match(/\(\d{3}\) \d{3}-\d{4}/)) {
          phone = phoneText;
        }
      }

      // Clean phone format if needed
      if (phone) {
        // Remove parentheses and format consistently
        phone = phone.replace(/[\(\)]/g, '').replace(/\s/g, '-');
      }

      // Only add if we have at least a name and it's not empty
      if (name && name !== '' && !name.match(/^\s*$/)) {
        staff.push({ 
          name, 
          title: title || null, 
          email, 
          phone,
          category 
        });
      }
    });
  });

  return { staff };
}