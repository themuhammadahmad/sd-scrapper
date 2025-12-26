import * as cheerio from "cheerio";

export default async function spTeamProParser(html, url) {
  const $ = cheerio.load(html);
  
  // Check if this is the SP Team Pro format
  if (!$('.sptp-row').length && !$('.sp-team-pro-item').length) {
    return null;
  }

  const staff = [];
  
  // Process each staff member item
  $('.sp-team-pro-item').each((index, itemEl) => {
    const $item = $(itemEl);
    
    // Extract name from h2 element
    let name = "";
    const $nameElement = $item.find('.sptp-member-name .sptp-name');
    if ($nameElement.length) {
      name = $nameElement.text().trim();
      // Clean up name - remove prefix like "Mr.", "Ms.", "Dr." if desired
      name = name.replace(/^(Mr\.|Ms\.|Mrs\.|Dr\.)\s*/i, '').trim();
    }
    
    // Extract title/position
    let title = "";
    const $titleElement = $item.find('.sptp-member-profession .sptp-profession-text');
    if ($titleElement.length) {
      title = $titleElement.text().trim();
      // Clean up title
      title = title.replace(/\s+/g, ' ').replace(/\|/g, '| ').trim();
    }
    
    // Extract email
    let email = null;
    const $emailElement = $item.find('.sptp-member-email a');
    if ($emailElement.length) {
      // Check href attribute first (some might have mailto)
      const href = $emailElement.attr('href');
      if (href && href.startsWith('mailto:')) {
        email = href.replace('mailto:', '').trim();
      } else {
        // Fallback to text content
        email = $emailElement.text().trim();
      }
    } else {
      // Also check for email in span text
      const emailText = $item.find('.sptp-member-email span').text().trim();
      if (emailText && emailText.includes('@')) {
        email = emailText;
      }
    }
    
    // Extract phone
    let phone = null;
    const $phoneElement = $item.find('.sptp-member-phone a');
    if ($phoneElement.length) {
      const href = $phoneElement.attr('href');
      if (href && href.startsWith('tel:')) {
        phone = href.replace('tel:', '').trim();
      } else {
        phone = $phoneElement.text().trim();
      }
    } else {
      // Also check for phone in span text
      const phoneText = $item.find('.sptp-member-phone span').text().trim();
      if (phoneText && phoneText.match(/\d/)) {
        phone = phoneText.trim();
      }
    }
    
    // Format phone if needed
    if (phone) {
      // Remove all non-digit characters except plus sign
      let digits = phone.replace(/[^\d+]/g, '');
      
      // Format US phone numbers (10 digits)
      if (digits.match(/^\d{10}$/)) {
        phone = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
      } else if (digits.match(/^\+\d{11}$/)) {
        // International format: +1-615-675-5358
        phone = `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5, 8)}-${digits.slice(8)}`;
      }
      // If it already has dashes or other format, keep as is
    }
    
    // Extract profile link
    let bioLink = null;
    const $profileLink = $item.find('.sptp-member-avatar a');
    if ($profileLink.length) {
      const href = $profileLink.attr('href');
      if (href && !href.includes('javascript:void(0)') && href !== '#0') {
        bioLink = href;
        // Make it absolute if it's relative
        if (bioLink && !bioLink.startsWith('http')) {
          const baseUrl = new URL(url);
          bioLink = new URL(bioLink, baseUrl.origin).href;
        }
      }
    }
    
    // Extract category if available (from parent elements or page structure)
    let category = "Staff Directory";
    // Look for category headings in the page
    const $parentContainer = $item.closest('.sptp-row').parent();
    const $categoryHeading = $parentContainer.find('h1, h2, h3, h4').first();
    if ($categoryHeading.length) {
      category = $categoryHeading.text().trim();
    }
    
    // Only add if we have at least a name
    if (name && name !== '') {
      staff.push({ 
        name, 
        title: title || null, 
        email, 
        phone,
        bioLink,
        category
      });
    }
  });
  
  // Also look for staff in other possible SP Team Pro layouts
  if (staff.length === 0) {
    // Alternative: check for individual member divs
    $('.sptp-member').each((index, memberEl) => {
      const $member = $(memberEl);
      
      // Extract name
      let name = "";
      const $nameElement = $member.find('.sptp-name');
      if ($nameElement.length) {
        name = $nameElement.text().trim();
        name = name.replace(/^(Mr\.|Ms\.|Mrs\.|Dr\.)\s*/i, '').trim();
      }
      
      // Extract title
      let title = "";
      const $titleElement = $member.find('.sptp-profession-text');
      if ($titleElement.length) {
        title = $titleElement.text().trim();
      }
      
      // Extract email
      let email = null;
      const $emailElement = $member.find('.sptp-member-email a, .sptp-member-email span');
      if ($emailElement.length) {
        const text = $emailElement.text().trim();
        if (text && text.includes('@')) {
          email = text;
        }
      }
      
      // Extract phone
      let phone = null;
      const $phoneElement = $member.find('.sptp-member-phone a, .sptp-member-phone span');
      if ($phoneElement.length) {
        const text = $phoneElement.text().trim();
        if (text && text.match(/\d/)) {
          phone = text;
          // Format phone
          const digits = phone.replace(/\D/g, '');
          if (digits.length === 10) {
            phone = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
          }
        }
      }
      
      // Only add if we have a name
      if (name && name !== '') {
        // Check if this person already exists
        const existingIndex = staff.findIndex(s => 
          s.name === name && 
          s.email === email
        );
        
        if (existingIndex === -1) {
          staff.push({ 
            name, 
            title: title || null, 
            email, 
            phone,
            bioLink: null,
            category: "Staff Directory"
          });
        }
      }
    });
  }
  
  // Remove duplicates based on name and email
  const uniqueStaff = [];
  const seen = new Set();
  
  staff.forEach(person => {
    const key = `${person.name}|${person.email}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueStaff.push(person);
    }
  });

  return uniqueStaff.length > 0 ? { staff: uniqueStaff } : null;
}