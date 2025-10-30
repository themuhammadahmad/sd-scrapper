import * as cheerio from "cheerio";

export default async function bobcatsTableParser(html, url) {
  const $ = cheerio.load(html);
  
  // Check if this is the bobcats table format
  if (!$('.table.bobcats-table').length) {
    return null;
  }

  const staff = [];
  let currentCategory = "";

  // Process all rows in the tbody
  $('.bobcats-table tbody tr').each((i, el) => {
    const $row = $(el);
    
    // Check if this is a category row (has colspan="3" and genpagebuilder-h3)
    if ($row.find('td[colspan="3"] .genpagebuilder-h3').length) {
      currentCategory = $row.find('.genpagebuilder-h3').text().trim();
      return; // Continue to next row
    }
    
    // Check if this is a staff member row (has multiple td cells)
    const cells = $row.find('td');
    if (cells.length >= 2) {
      const titleCell = $(cells[0]);
      const nameCell = $(cells[1]);
      const emailCell = $(cells[2]);
      
      // Extract titles (can be multiple per row)
      const titles = [];
      titleCell.find('span.text-small').each((j, titleEl) => {
        const titleText = $(titleEl).text().trim();
        if (titleText && !titleText.includes('@')) { // Filter out email-like text
          titles.push(titleText);
        }
      });
      
      // Extract names (can be multiple per row)
      const names = [];
      nameCell.find('span.text-small').each((j, nameEl) => {
        const nameText = $(nameEl).text().trim();
        if (nameText && nameText !== '&nbsp;' && !nameText.includes('@')) {
          names.push(nameText);
        }
      });
      
      // Extract emails (can be multiple per row)
      const emails = [];
      emailCell.find('a[href^="mailto:"]').each((j, emailEl) => {
        const email = $(emailEl).attr('href')?.replace('mailto:', '') || $(emailEl).text().trim();
        if (email && email !== '&nbsp;') {
          emails.push(email);
        }
      });
      
      // Also check for email text directly in spans (like in Track section)
      emailCell.find('span.text-small').each((j, spanEl) => {
        const text = $(spanEl).text().trim();
        if (text && text.includes('@') && !emails.includes(text)) {
          emails.push(text);
        }
      });
      
      // Create staff entries
      // If we have matching counts, pair them up
      const maxCount = Math.max(titles.length, names.length, emails.length);
      
      for (let i = 0; i < maxCount; i++) {
        const name = names[i] || null;
        const title = titles[i] || null;
        const email = emails[i] || null;
        
        // Only add if we have at least a name
        if (name && name !== '&nbsp;' && name !== '') {
          staff.push({ 
            name, 
            title, 
            email, 
            phone: null, // No phone numbers in this format
            category: currentCategory 
          });
        }
      }
    }
  });

  return { staff };
}