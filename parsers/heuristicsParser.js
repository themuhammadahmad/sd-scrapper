// parsers/heuristicsParser.js
import * as cheerio from "cheerio";

export default async function heuristicsParser(html, url) {
  const $ = cheerio.load(html);
  const staff = [];

  // ========== PATTERN 1: Schema.org Person markup ==========
  $('[itemtype="https://schema.org/Person"]').each((i, el) => {
    const $el = $(el);
    
    // Extract name from itemprop="name"
    let name = "";
    const nameEl = $el.find('[itemprop="name"]');
    if (nameEl.length) {
      name = nameEl.text().trim();
    }
    
    // If no name found with itemprop, try h6 with itemprop
    if (!name) {
      name = $el.find('h6[itemprop="name"]').text().trim();
    }
    
    // Extract title from itemprop="jobTitle"
    let title = "";
    const titleEl = $el.find('[itemprop="jobTitle"]');
    if (titleEl.length) {
      title = titleEl.text().trim().replace(/\s+/g, ' ');
    }
    
    // Extract email from mailto links with itemprop="email"
    let email = null;
    const emailLink = $el.find('a[itemprop="email"], a[href^="mailto:"]');
    if (emailLink.length) {
      email = emailLink.attr('href')?.replace('mailto:', '').trim() || null;
    }
    
    // Extract phone from tel links with itemprop="telephone"
    let phone = null;
    const phoneLink = $el.find('a[itemprop="telephone"], a[href^="tel:"]');
    if (phoneLink.length) {
      phone = phoneLink.attr('href')?.replace('tel:', '').trim() || null;
      // Clean up phone format
      if (phone) {
        phone = phone.replace(/[^\d]/g, '');
        if (phone.length === 10) {
          phone = `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`;
        }
      }
    }
    
    // If we found a name, add the staff member
    if (name && name.trim() !== '') {
      staff.push({ 
        name, 
        title: title || null, 
        email, 
        phone,
        category: "Staff Directory" 
      });
    }
  });

  // ========== PATTERN 2: Common staff directory patterns ==========
  if (staff.length === 0) {
    // Look for patterns like "Name: Title, Email, Phone"
    $('div, p, li').each((i, el) => {
      const $el = $(el);
      const text = $el.text().trim();
      
      // Skip empty or very short elements
      if (text.length < 20) return;
      
      // Check for patterns that look like staff information
      const hasNameAndTitle = /[A-Z][a-z]+ [A-Z][a-z]+/.test(text);
      const hasEmail = /[\w._%+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(text);
      const hasPhone = /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/.test(text);
      
      if ((hasNameAndTitle && hasEmail) || (hasNameAndTitle && hasPhone)) {
        // Extract name (look for capitalized first and last name)
        const nameMatch = text.match(/^([A-Z][a-z]+ [A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
        const name = nameMatch ? nameMatch[1].trim() : '';
        
        // Extract email
        const emailMatch = text.match(/[\w._%+-]+@[\w.-]+\.[A-Za-z]{2,}/);
        const email = emailMatch ? emailMatch[0].trim() : null;
        
        // Extract phone
        const phoneMatch = text.match(/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/);
        let phone = phoneMatch ? phoneMatch[0].trim() : null;
        
        // Clean phone format
        if (phone) {
          phone = phone.replace(/[^\d]/g, '');
          if (phone.length === 10) {
            phone = `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`;
          }
        }
        
        // Extract title (everything between name and email/phone)
        let title = '';
        if (name) {
          const afterName = text.substring(name.length).trim();
          // Try to find title before email or phone markers
          const emailIndex = afterName.indexOf('@');
          const phoneIndex = afterName.search(/\d{3}[-.\s]?\d{3}/);
          
          let titleEndIndex = afterName.length;
          if (emailIndex > -1) titleEndIndex = Math.min(titleEndIndex, emailIndex);
          if (phoneIndex > -1) titleEndIndex = Math.min(titleEndIndex, phoneIndex);
          
          title = afterName.substring(0, titleEndIndex).trim();
          
          // Clean up common separators
          title = title.replace(/^[,\-:\s]+|[,\-:\s]+$/g, '').trim();
        }
        
        if (name && (email || phone || title)) {
          staff.push({ 
            name, 
            title: title || null, 
            email, 
            phone,
            category: "Staff Directory" 
          });
        }
      }
    });
  }

  // ========== PATTERN 3: Look for staff in structured containers ==========
  if (staff.length === 0) {
    // Check for containers that might hold staff info
    const possibleContainers = $('.staff, .person, .employee, .contact, .bio, .directory-item');
    
    possibleContainers.each((i, container) => {
      const $container = $(container);
      const containerText = $container.text().trim();
      
      // Look for name patterns within the container
      const nameMatch = containerText.match(/^([A-Z][a-z]+ [A-Z][a-z]+)/);
      if (!nameMatch) return;
      
      const name = nameMatch[1].trim();
      
      // Look for email within container
      let email = null;
      const emailLink = $container.find('a[href^="mailto:"]');
      if (emailLink.length) {
        email = emailLink.attr('href')?.replace('mailto:', '').trim();
      } else {
        const emailMatch = containerText.match(/[\w._%+-]+@[\w.-]+\.[A-Za-z]{2,}/);
        email = emailMatch ? emailMatch[0].trim() : null;
      }
      
      // Look for phone within container
      let phone = null;
      const phoneLink = $container.find('a[href^="tel:"]');
      if (phoneLink.length) {
        phone = phoneLink.attr('href')?.replace('tel:', '').trim();
      } else {
        const phoneMatch = containerText.match(/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/);
        phone = phoneMatch ? phoneMatch[0].trim() : null;
      }
      
      // Try to extract title (look for text that's not name, email, or phone)
      let title = '';
      const nameIndex = containerText.indexOf(name);
      if (nameIndex > -1) {
        const afterName = containerText.substring(nameIndex + name.length).trim();
        const titleEnd = email ? afterName.indexOf(email) : 
                        phone ? afterName.search(/\d{3}[-.\s]?\d{3}/) : 
                        afterName.length;
        
        if (titleEnd > 0) {
          title = afterName.substring(0, titleEnd).trim();
          title = title.replace(/^[,\-:\s]+|[,\-:\s]+$/g, '').trim();
        }
      }
      
      if (name && (email || phone || title)) {
        staff.push({ 
          name, 
          title: title || null, 
          email, 
          phone,
          category: "Staff Directory" 
        });
      }
    });
  }

  // ========== PATTERN 4: Fallback to generic table parsing ==========
  if (staff.length === 0) {
    // Use similar logic to genericTableParser but as fallback
    $('table tr').each((i, row) => {
      const $row = $(row);
      const cells = $row.find('td');
      
      if (cells.length >= 2) {
        const name = $(cells[0]).text().trim();
        const title = $(cells[1]).text().trim();
        
        // Look for email in any cell
        let email = null;
        cells.each((j, cell) => {
          const $cell = $(cell);
          const emailLink = $cell.find('a[href^="mailto:"]');
          if (emailLink.length && !email) {
            email = emailLink.attr('href')?.replace('mailto:', '').trim();
          }
        });
        
        // Look for phone in any cell
        let phone = null;
        cells.each((j, cell) => {
          const $cell = $(cell);
          const phoneLink = $cell.find('a[href^="tel:"]');
          if (phoneLink.length && !phone) {
            phone = phoneLink.attr('href')?.replace('tel:', '').trim();
          }
        });
        
        // If no phone found via link, search text
        if (!phone) {
          cells.each((j, cell) => {
            const text = $(cell).text();
            const phoneMatch = text.match(/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/);
            if (phoneMatch && !phone) {
              phone = phoneMatch[0].trim();
            }
          });
        }
        
        if (name && name.trim() !== '') {
          staff.push({ 
            name, 
            title: title || null, 
            email, 
            phone,
            category: "Staff Directory" 
          });
        }
      }
    });
  }

  // Remove duplicates
  const uniqueStaff = [];
  const seen = new Set();
  
  staff.forEach(person => {
    const key = `${person.name}|${person.email}|${person.phone}`;
    if (!seen.has(key) && person.name && person.name.trim() !== '') {
      seen.add(key);
      uniqueStaff.push(person);
    }
  });

  return uniqueStaff.length ? { staff: uniqueStaff } : null;
}