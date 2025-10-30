import * as cheerio from "cheerio";

export default async function subtitleCategoryParser(html, url) {
  const $ = cheerio.load(html);
  
  // Check if this table has subtitle rows for categories
  if (!$('table').length || !$('tr.subtitle').length) {
    return null;
  }

  const staff = [];
  let currentCategory = "";

  // Process all rows in the tbody
  $('table tbody tr').each((i, el) => {
    const $row = $(el);
    
    // Check if this is a category subtitle row
    if ($row.hasClass('subtitle')) {
      currentCategory = $row.find('td').text().trim();
      return; // Continue to next row
    }
    
    // Check if this is a regular staff row (not in thead)
    if (!$row.parent().is('thead') && $row.find('td').length > 0) {
      // Extract name
      let name = "";
      const nameLink = $row.find('td:nth-child(1) a');
      if (nameLink.length) {
        name = nameLink.text().trim();
      } else {
        // Fallback: get text from first td
        name = $row.find('td:nth-child(1)').text().trim();
      }

      // Extract title
      let title = "";
      const titleCell = $row.find('td:nth-child(2)');
      if (titleCell.length) {
        title = titleCell.find('p').text().trim() || titleCell.text().trim();
      }

      // Extract phone
      let phone = null;
      const phoneLink = $row.find('td:nth-child(3) a[href^="tel:"]');
      if (phoneLink.length) {
        phone = phoneLink.attr('href')?.replace('tel:', '') || phoneLink.text().trim();
      } else {
        // Fallback: check phone cell text directly
        const phoneText = $row.find('td:nth-child(3)').text().trim();
        if (phoneText && phoneText.match(/\d/)) {
          phone = phoneText;
        }
      }

      // Format phone if it's just digits (like "631-7546")
      if (phone && phone.match(/^\d{3}-\d{4}$/)) {
        // Assuming it's a campus extension, you might want to add area code
        // or leave as is depending on your needs
        phone = phone; // Keep as is for now
      }

      // Extract email
      let email = null;
      const emailLink = $row.find('td:nth-child(4) a[href^="mailto:"]');
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
          phone: phone || null,
          category: currentCategory 
        });
      }
    }
  });

  return { staff };
}