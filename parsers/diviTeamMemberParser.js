import * as cheerio from "cheerio";

export default async function diviTeamMemberParser(html, url) {
  const $ = cheerio.load(html);
  
  // Check if this is the Divi Builder team member format
  if (!$('.et_pb_team_member_description').length) {
    return null;
  }

  const staff = [];
  let category = "Staff Directory";
  
  // Try to extract category from page headings
  const $pageTitle = $('h1, h2').first();
  if ($pageTitle.length) {
    category = $pageTitle.text().trim();
  }
  
  // Process each team member description
  $('.et_pb_team_member_description').each((index, memberEl) => {
    const $member = $(memberEl);
    
    // Extract name from h4 element
    let name = "";
    const $nameElement = $member.find('h4.et_pb_module_header');
    if ($nameElement.length) {
      name = $nameElement.text().trim();
    }
    
    // Extract title/position
    let title = "";
    const $titleElement = $member.find('p.et_pb_member_position');
    if ($titleElement.length) {
      title = $titleElement.text().trim();
    }
    
    // Extract contact info from the content div
    let email = null;
    let phone = null;
    
    // Get all text content from the member description
    const contentText = $member.find('div').first().text() || $member.text();
    
    // Extract email
    const emailMatch = contentText.match(/[\w._%+-]+@[\w.-]+\.[A-Za-z]{2,}/);
    if (emailMatch) {
      email = emailMatch[0].trim();
    }
    
    // Extract phone - look for "Phone:" pattern
    const phoneMatch = contentText.match(/Phone:\s*([\d\s\-\(\)\.]+)/i);
    if (phoneMatch && phoneMatch[1]) {
      phone = phoneMatch[1].trim();
      // Clean phone number
      phone = phone.replace(/\s+/g, '').replace(/[\(\)]/g, '');
      
      // Format if it's just digits
      if (phone.match(/^\d{10}$/)) {
        phone = `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`;
      }
    } else {
      // Alternative: look for any phone number pattern
      const altPhoneMatch = contentText.match(/\d{3}[-.]?\d{3}[-.]?\d{4}/);
      if (altPhoneMatch) {
        phone = altPhoneMatch[0].trim();
      }
    }
    
    // Extract education/degree info if present
    let education = null;
    const degreeMatch = contentText.match(/([A-Z\.]+\s*,\s*[^,]+(?:,\s*[^,]+)*)/);
    if (degreeMatch && !degreeMatch[0].includes('@') && !degreeMatch[0].match(/\d{3}[-.]?\d{3}[-.]?\d{4}/)) {
      education = degreeMatch[0].trim();
    }
    
    // Look for bio link in parent or nearby elements
    let bioLink = null;
    const $parentContainer = $member.closest('.et_pb_team_member, .et_pb_column, .et_pb_row');
    if ($parentContainer.length) {
      const $potentialLink = $parentContainer.find('a').first();
      if ($potentialLink.length) {
        const href = $potentialLink.attr('href');
        if (href && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
          bioLink = href;
          // Make it absolute if it's relative
          if (bioLink && !bioLink.startsWith('http')) {
            try {
              bioLink = new URL(bioLink, url).href;
            } catch (e) {
              // Keep as is if URL construction fails
            }
          }
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
        education, // Additional field
        category
      });
    }
  });
  
  // Also check for team members in other Divi layouts
  if (staff.length === 0) {
    // Alternative Divi layout: et_pb_team_member
    $('.et_pb_team_member').each((index, memberEl) => {
      const $member = $(memberEl);
      
      // Extract name
      let name = "";
      const $nameElement = $member.find('.et_pb_team_member_name');
      if ($nameElement.length) {
        name = $nameElement.text().trim();
      } else {
        // Fallback to any h4
        name = $member.find('h4').first().text().trim();
      }
      
      // Extract title
      let title = "";
      const $titleElement = $member.find('.et_pb_team_member_position');
      if ($titleElement.length) {
        title = $titleElement.text().trim();
      }
      
      // Extract contact info
      let email = null;
      let phone = null;
      
      const $content = $member.find('.et_pb_team_member_description');
      const contentText = $content.text();
      
      // Extract email
      const emailMatch = contentText.match(/[\w._%+-]+@[\w.-]+\.[A-Za-z]{2,}/);
      if (emailMatch) {
        email = emailMatch[0].trim();
      }
      
      // Extract phone
      const phoneMatch = contentText.match(/Phone:\s*([\d\s\-\(\)\.]+)/i);
      if (phoneMatch && phoneMatch[1]) {
        phone = phoneMatch[1].trim().replace(/\s+/g, '');
      }
      
      if (name && name !== '') {
        // Check for duplicates
        const existingIndex = staff.findIndex(s => 
          s.name === name && s.email === email
        );
        
        if (existingIndex === -1) {
          staff.push({ 
            name, 
            title: title || null, 
            email, 
            phone,
            bioLink: null,
            category
          });
        }
      }
    });
  }
  
  // Remove duplicates
  const uniqueStaff = [];
  const seen = new Set();
  
  staff.forEach(person => {
    const key = `${person.name}|${person.email}|${person.title}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueStaff.push(person);
    }
  });
  
  // Log category distribution
  console.log(`📊 Divi Team Member Parser Results:`);
  console.log(`   Total staff found: ${uniqueStaff.length}`);
  console.log(`   Category: ${category}`);
  
  // Show sample of extracted data
  if (uniqueStaff.length > 0) {
    console.log(`   Sample staff:`);
    uniqueStaff.slice(0, 3).forEach((person, i) => {
      console.log(`     ${i+1}. ${person.name} - ${person.title || 'No title'}`);
      if (person.email) console.log(`        Email: ${person.email}`);
      if (person.phone) console.log(`        Phone: ${person.phone}`);
    });
  }

  return uniqueStaff.length > 0 ? { staff: uniqueStaff } : null;
}