import * as cheerio from "cheerio";

export default async function uscSidearmParser(html, url) {
  const $ = cheerio.load(html);
  
  // Check if this is the USC/Army staff directory format
  if (!$('.c-staff-directory-page__content--table-view').length && !$('[data-test-id="staff-directory-archive-view-type-table__group"]').length) {
    return null;
  }

  const staff = [];
  let currentCategory = "";

  // Process each table group (department/category)
  $('[data-test-id="staff-directory-archive-view-type-table__group"]').each((groupIdx, groupEl) => {
    const $group = $(groupEl);
    
    // Extract category from the table header - look for th with colspan (could be 3 or 4)
    const $categoryHeader = $group.find('thead th[colspan]');
    if ($categoryHeader.length) {
      currentCategory = $categoryHeader.text().trim();
      // Clean up category - remove extra spaces and normalize
      currentCategory = currentCategory.replace(/\s+/g, ' ').trim();
      // Remove fax/phone info if present at the end (keep the category name)
      currentCategory = currentCategory.replace(/\s*\|\s*(Fax|Phone|@).*$/i, '').trim();
    }
    
    // Determine number of columns in this table
    const $headers = $group.find('thead tr.s-table-header__row--subheading th');
    const columnCount = $headers.length;
    
    // Process each row in the tbody
    $group.find('tbody tr.s-table-body__row').each((rowIdx, rowEl) => {
      const $row = $(rowEl);
      
      // Extract name from the first cell
      const $nameCell = $row.find('td:first-child');
      const $nameLink = $nameCell.find('a');
      let name = "";
      let profileLink = null;
      
      if ($nameLink.length) {
        name = $nameLink.find('span').text().trim();
        if (!name) {
          name = $nameLink.text().trim();
        }
        // Extract profile link
        profileLink = $nameLink.attr('href');
        if (profileLink && !profileLink.startsWith('http')) {
          try {
            const baseUrl = new URL(url);
            profileLink = new URL(profileLink, baseUrl.origin).href;
          } catch (e) {
            // If URL parsing fails, keep as is
          }
        }
      } else {
        name = $nameCell.text().trim();
      }
      
      // Clean up name - remove extra spaces
      name = name.replace(/\s+/g, ' ').trim();
      
      // Skip if no name
      if (!name) return;
      
      // Extract title from the second cell
      let title = "";
      const $titleCell = $row.find('td:nth-child(2)');
      if ($titleCell.length) {
        title = $titleCell.text().trim();
        // Clean up title - handle HTML entities and extra spaces
        title = title.replace(/\s+/g, ' ').replace(/&amp;/g, '&').trim();
      }
      
      // Extract email from the third cell (if exists)
      let email = null;
      let phone = null;
      
      if (columnCount >= 3) {
        const $emailCell = $row.find('td:nth-child(3)');
        const $emailLink = $emailCell.find('a[href^="mailto:"]');
        if ($emailLink.length) {
          email = $emailLink.attr('href')?.replace('mailto:', '').trim();
        } else {
          // Check for email in text
          const emailText = $emailCell.text().trim();
          if (emailText && emailText.includes('@')) {
            email = emailText;
          }
        }
      }
      
      // Extract phone from the fourth cell (if exists - column count 4)
      if (columnCount >= 4) {
        const $phoneCell = $row.find('td:nth-child(4)');
        let phoneText = $phoneCell.text().trim();
        if (phoneText) {
          // Look for phone pattern (###) ###-#### or ###-###-####
          const phoneMatch = phoneText.match(/\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/);
          if (phoneMatch) {
            phone = `(${phoneMatch[1]}) ${phoneMatch[2]}-${phoneMatch[3]}`;
          } else if (phoneText.match(/\d/)) {
            phone = phoneText;
          }
        }
        
        // Check for phone in tel: link
        const $phoneLink = $phoneCell.find('a[href^="tel:"]');
        if ($phoneLink.length && !phone) {
          phone = $phoneLink.attr('href')?.replace('tel:', '').trim();
        }
      }
      
      // Clean up title - remove HTML tags that might be left
      title = title.replace(/<[^>]*>/g, '').trim();
      
      staff.push({
        name,
        title: title || null,
        email: email || null,
        phone: phone || null,
        category: currentCategory || null,
        profileLink: profileLink || null
      });
    });
  });
  
  // Remove duplicates based on name + email (if email exists) or name + title
  const uniqueStaff = [];
  const seen = new Set();
  
  for (const person of staff) {
    let key;
    if (person.email) {
      key = `${person.name}|${person.email}`;
    } else {
      key = `${person.name}|${person.title || ''}|${person.category || ''}`;
    }
    
    if (!seen.has(key)) {
      seen.add(key);
      uniqueStaff.push(person);
    }
  }
  
  return uniqueStaff.length > 0 ? { staff: uniqueStaff } : null;
}