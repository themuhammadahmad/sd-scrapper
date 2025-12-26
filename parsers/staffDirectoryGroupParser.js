import * as cheerio from "cheerio";

export default async function staffDirectoryGroupParser(html, url) {
  const $ = cheerio.load(html);
  
  // Check if this is the staff-directory-group format
  if (!$('.staff-directory-group').length) {
    return null;
  }

  const staff = [];
  
  // Process each staff-directory-group section
  $('.staff-directory-group').each((sectionIndex, sectionEl) => {
    const $section = $(sectionEl);
    
    // Extract category from h2 heading
    let category = "";
    const categoryH2 = $section.find('h2').first();
    if (categoryH2.length) {
      category = categoryH2.text().trim();
    } else {
      // Fallback: try aria-label or other attributes
      const ariaLabel = $section.attr('aria-label');
      if (ariaLabel) {
        category = ariaLabel;
      } else {
        category = "Staff Directory";
      }
    }
    
    // Check if this section has a table layout
    const hasTable = $section.find('table.table').length > 0;
    
    if (hasTable) {
      // ========== TABLE-BASED LAYOUT ==========
      $section.find('table.table tbody tr').each((rowIndex, rowEl) => {
        const $row = $(rowEl);
        
        // Skip header rows if they somehow end up in tbody
        if ($row.find('th').length > 0) {
          return;
        }
        
        // Extract name from the first column
        let name = "";
        const nameLink = $row.find('td:first-child a');
        if (nameLink.length) {
          name = nameLink.text().trim();
        } else {
          name = $row.find('td:first-child').text().trim();
        }
        
        // Clean up name
        name = name.replace(/\s+/g, ' ').trim();
        
        // Extract title from the second column
        let title = "";
        const titleElement = $row.find('td:nth-child(2)');
        if (titleElement.length) {
          title = titleElement.text().trim();
          // Clean up title - remove HTML entities if present
          title = title.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();
        }
        
        // Extract phone from the third column
        let phone = null;
        const phoneElement = $row.find('td:nth-child(3)');
        if (phoneElement.length) {
          phone = phoneElement.text().trim();
          // Clean up phone number
          phone = phone.replace(/[^\d-]/g, '').trim();
          if (phone && phone.match(/^\d{10}$/)) {
            phone = `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`;
          }
        }
        
        // Extract email from the fourth column
        let email = null;
        const emailLink = $row.find('td:nth-child(4) a[href^="mailto:"]');
        if (emailLink.length) {
          email = emailLink.attr('href')?.replace('mailto:', '').trim() || null;
        } else {
          // Fallback: check text content of the fourth column
          const emailText = $row.find('td:nth-child(4)').text().trim();
          if (emailText && emailText.includes('@')) {
            email = emailText.trim();
          }
        }
        
        // Extract bio link from name column
        let bioLink = null;
        if (nameLink.length) {
          const href = nameLink.attr('href');
          if (href && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
            bioLink = href;
            // Make it absolute if it's relative
            if (bioLink && !bioLink.startsWith('http')) {
              const baseUrl = new URL(url);
              bioLink = new URL(bioLink, baseUrl.origin).href;
            }
          }
        }
        
        // Only add if we have at least a name
        if (name && name !== '') {
          staff.push({ 
            name, 
            title: title || null, 
            email, 
            phone,
            bioLink,
            category: category || "Uncategorized"
          });
        }
      });
    } else {
      // ========== CARD-BASED LAYOUT ==========
      // Process all staff cards in this section - target the .card elements
      $section.find('.card').each((cardIndex, cardEl) => {
        const $card = $(cardEl);
        
        // Extract name from the card title link - check multiple possible selectors
        let name = "";
        const nameLink = $card.find('.card-title.h5.fw-bold.stretched-link');
        if (nameLink.length) {
          name = nameLink.text().trim();
        } else {
          // Try alternative selectors
          const altName = $card.find('a[href*="/directory/bios/"] .card-title');
          if (altName.length) {
            name = altName.text().trim();
          } else {
            // Last resort: find any link with aria-label containing "fullName"
            const fullNameLink = $card.find('a[aria-label*="fullName"]');
            if (fullNameLink.length) {
              // Extract name from aria-label or text
              name = fullNameLink.text().trim() || 
                     fullNameLink.attr('aria-label')?.replace(/fullName - .*:/, '').trim() || "";
            }
          }
        }
        
        // Clean up name - remove extra whitespace
        name = name.replace(/\s+/g, ' ').trim();
        
        // Extract title/position
        let title = "";
        const titleElement = $card.find('.card-text.mb-0.small.text-muted');
        if (titleElement.length) {
          title = titleElement.text().trim();
          
          // Clean up title - remove HTML entities if present
          title = title.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();
        }
        
        // Extract email
        let email = null;
        const emailLink = $card.find('a[href^="mailto:"]');
        if (emailLink.length) {
          email = emailLink.attr('href')?.replace('mailto:', '') || null;
          
          // Clean up email if needed
          if (email) {
            email = email.trim();
          }
        }
        
        // Extract phone
        let phone = null;
        const phoneLink = $card.find('a[href^="tel:"]');
        if (phoneLink.length) {
          phone = phoneLink.attr('href')?.replace('tel:', '') || null;
          
          // Format phone number if it's in the format "4125786310"
          if (phone && phone.match(/^\d{10}$/)) {
            phone = `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`;
          } else if (phone && phone.match(/^\d{3}-\d{3}-\d{4}$/)) {
            // Already formatted, keep as is
          } else {
            // Clean up any non-digit characters except dash
            phone = phone.replace(/[^\d-]/g, '');
          }
        }
        
        // Extract bio link for reference
        let bioLink = null;
        const bioLinks = $card.find('a[href*="/directory/bios/"]');
        if (bioLinks.length) {
          // Get the bio link that doesn't have mailto: or tel:
          bioLinks.each((i, link) => {
            const href = $(link).attr('href');
            if (href && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
              bioLink = href;
              // Make it absolute if it's relative
              if (bioLink && !bioLink.startsWith('http')) {
                const baseUrl = new URL(url);
                bioLink = new URL(bioLink, baseUrl.origin).href;
              }
            }
          });
        }
        
        // Only add if we have at least a name
        if (name && name !== '') {
          staff.push({ 
            name, 
            title: title || null, 
            email, 
            phone,
            bioLink,
            category: category || "Uncategorized"
          });
        }
      });
    }
  });

  // Also check for staff members that might not be in .staff-directory-group sections
  // but have similar patterns (for completeness)
  $('table.table').each((tableIndex, tableEl) => {
    const $table = $(tableEl);
    
    // Only process tables that aren't already inside .staff-directory-group
    if ($table.closest('.staff-directory-group').length === 0) {
      // Check if this looks like a staff directory table
      const headers = $table.find('thead th').map((i, el) => $(el).text().toLowerCase()).get();
      const isStaffTable = headers.some(h => 
        h.includes('name') || h.includes('title') || h.includes('position') || 
        h.includes('email') || h.includes('phone')
      );
      
      if (isStaffTable) {
        $table.find('tbody tr').each((rowIndex, rowEl) => {
          const $row = $(rowEl);
          
          // Skip header rows
          if ($row.find('th').length > 0) {
            return;
          }
          
          // Extract data based on column index
          const nameCol = $row.find('td:first-child').text().trim();
          const nameLink = $row.find('td:first-child a');
          const name = nameLink.length ? nameLink.text().trim() : nameCol;
          
          if (name && name !== '') {
            // Try to extract other information
            let title = "";
            let email = null;
            let phone = null;
            let bioLink = null;
            
            // Check each column for potential data
            $row.find('td').each((colIndex, colEl) => {
              const $col = $(colEl);
              const text = $col.text().toLowerCase().trim();
              
              if (text.includes('@') || $col.find('a[href^="mailto:"]').length) {
                // This column likely contains email
                const mailLink = $col.find('a[href^="mailto:"]');
                email = mailLink.length ? 
                  mailLink.attr('href').replace('mailto:', '').trim() : 
                  $col.text().trim();
              } else if (/\d{3}[-.]?\d{3}[-.]?\d{4}/.test(text) || $col.find('a[href^="tel:"]').length) {
                // This column likely contains phone
                const telLink = $col.find('a[href^="tel:"]');
                phone = telLink.length ? 
                  telLink.attr('href').replace('tel:', '').trim() : 
                  $col.text().trim();
              } else if (text && text.length > 0 && !text.includes('name')) {
                // This column might be title if it's not email/phone and not the name column
                if (!title && colIndex > 0) {
                  title = $col.text().trim();
                }
              }
            });
            
            // Extract bio link from name column if available
            if (nameLink.length) {
              const href = nameLink.attr('href');
              if (href && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
                bioLink = href;
                if (bioLink && !bioLink.startsWith('http')) {
                  const baseUrl = new URL(url);
                  bioLink = new URL(bioLink, baseUrl.origin).href;
                }
              }
            }
            
            staff.push({ 
              name, 
              title: title || null, 
              email, 
              phone,
              bioLink,
              category: "Staff Directory"
            });
          }
        });
      }
    }
  });

  // Remove duplicates based on name, email, and phone combination
  const uniqueStaff = [];
  const seen = new Set();
  
  staff.forEach(person => {
    const key = `${person.name}|${person.email}|${person.phone}|${person.category}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueStaff.push(person);
    }
  });

  return { staff: uniqueStaff };
}