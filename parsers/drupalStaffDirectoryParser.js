import * as cheerio from "cheerio";

export default async function drupalStaffDirectoryParser(html, url) {
  const $ = cheerio.load(html);
  
  // Check if this is the Drupal view-staff-directory format
  if (!$('.view-staff-directory').length) {
    return null;
  }

  const staff = [];
  
  // Process each sport category (item-list)
  $('.view-staff-directory .item-list').each((categoryIndex, categoryEl) => {
    const $category = $(categoryEl);
    
    // Extract category from h3 heading
    let category = "";
    const categoryH3 = $category.find('h3').first();
    if (categoryH3.length) {
      category = categoryH3.text().trim();
    } else {
      category = "Uncategorized";
    }
    
    // Process each staff member in this category
    $category.find('li').each((staffIndex, staffEl) => {
      const $staff = $(staffEl);
      const $viewsField = $staff.find('.views-field-nothing');
      
      if ($viewsField.length) {
        // Extract name from the name div
        let name = "";
        const nameElement = $viewsField.find('.name a');
        if (nameElement.length) {
          name = nameElement.text().trim();
        } else {
          // Fallback: try the p tag inside .name
          const nameText = $viewsField.find('.name p').text().trim();
          if (nameText) {
            name = nameText;
          }
        }
        
        // Extract title/position from coaching-title div
        let title = "";
        const titleElement = $viewsField.find('.coaching-title');
        if (titleElement.length) {
          title = titleElement.text().trim();
          // Clean up title
          title = title.replace(/\s+/g, ' ').replace(/&amp;/g, '&').trim();
        }
        
        // Extract bio/profile link
        let bioLink = null;
        const bioLinkElement = $viewsField.find('.photo a, .name a');
        if (bioLinkElement.length) {
          const href = bioLinkElement.attr('href');
          if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
            bioLink = href;
            // Make it absolute if it's relative
            if (bioLink && !bioLink.startsWith('http')) {
              const baseUrl = new URL(url);
              bioLink = new URL(bioLink, baseUrl.origin).href;
            }
          }
        }
        
        // Extract email - check if there are mailto links in the parent container
        let email = null;
        const emailLink = $staff.find('a[href^="mailto:"]').first();
        if (emailLink.length) {
          email = emailLink.attr('href')?.replace('mailto:', '').trim() || null;
        }
        
        // Extract phone - check if there are tel links in the parent container
        let phone = null;
        const phoneLink = $staff.find('a[href^="tel:"]').first();
        if (phoneLink.length) {
          phone = phoneLink.attr('href')?.replace('tel:', '').trim() || null;
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
      }
    });
  });

  // Also check for staff members that might be outside the item-list structure
  // Some Drupal views might have different layouts
  $('.view-staff-directory .views-row, .view-staff-directory .views-field').each((index, element) => {
    const $element = $(element);
    
    // Look for staff info in alternative structures
    const hasName = $element.find('.name, .field-name-title, [class*="field-name-field"]').length > 0;
    const hasPhoto = $element.find('.photo, .field-name-field-image, img').length > 0;
    
    if ((hasName || hasPhoto) && !$element.closest('.item-list').length) {
      // This might be a different layout - attempt to extract
      let name = "";
      let title = "";
      let category = "Uncategorized";
      let bioLink = null;
      let email = null;
      let phone = null;
      
      // Try to extract name from various possible selectors
      const nameElement = $element.find('.name a, .field-name-title a, h3 a, h4 a').first();
      if (nameElement.length) {
        name = nameElement.text().trim();
      }
      
      // Try to extract title
      const titleElement = $element.find('.coaching-title, .field-name-field-position, .title').first();
      if (titleElement.length) {
        title = titleElement.text().trim();
      }
      
      // Try to extract bio link
      const linkElement = $element.find('a').first();
      if (linkElement.length) {
        const href = linkElement.attr('href');
        if (href && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
          bioLink = href;
          if (bioLink && !bioLink.startsWith('http')) {
            const baseUrl = new URL(url);
            bioLink = new URL(bioLink, baseUrl.origin).href;
          }
        }
      }
      
      // Look for email and phone
      email = $element.find('a[href^="mailto:"]').attr('href')?.replace('mailto:', '').trim() || null;
      phone = $element.find('a[href^="tel:"]').attr('href')?.replace('tel:', '').trim() || null;
      
      if (name && name !== '') {
        // Check if this person already exists
        const existingIndex = staff.findIndex(s => 
          s.name === name && 
          s.title === title
        );
        
        if (existingIndex === -1) {
          staff.push({ 
            name, 
            title: title || null, 
            email, 
            phone,
            bioLink,
            category
          });
        }
      }
    }
  });

  // Remove duplicates
  const uniqueStaff = [];
  const seen = new Set();
  
  staff.forEach(person => {
    const key = `${person.name}|${person.title}|${person.email}|${person.category}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueStaff.push(person);
    }
  });

  return { staff: uniqueStaff };
}