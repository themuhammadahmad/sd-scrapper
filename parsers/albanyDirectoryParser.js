import * as cheerio from "cheerio";
// https://www.albany.edu/recreation-wellness/staff-directory
export default async function albanyDirectoryParser(html, url) {
  const $ = cheerio.load(html);
  
  // Check if this is the Albany directory format with faculty-member rows
  if (!$('.faculty-member').length || !$('.view-department-directory').length) {
    return null;
  }

  const staff = [];
  const category = extractCategory($);

  // Process each faculty member row
  $('.faculty-member.populated-row').each((i, memberEl) => {
    const $member = $(memberEl);
    
    // Extract name
    const name = $member.find('.views-field-title a').text().trim();
    
    // Extract title
    const title = $member.find('.views-field-field-title-person .field-content').text().trim();
    
    // Extract email
    let email = null;
    const emailLink = $member.find('.views-field-field-email a[href^="mailto:"]');
    if (emailLink.length) {
      email = emailLink.attr('href')?.replace('mailto:', '') || emailLink.text().trim();
    }
    
    // Extract phone (if available)
    let phone = null;
    const phoneField = $member.find('.views-field-field-display-phone .field-content');
    if (phoneField.length) {
      const phoneText = phoneField.text().trim();
      if (phoneText) {
        phone = phoneText;
      }
    }
    
    // Extract office address (if available)
    let office = null;
    const officeField = $member.find('.views-field-field-display-office-address .field-content');
    if (officeField.length) {
      const officeText = officeField.text().trim();
      if (officeText) {
        office = officeText;
      }
    }
    
    // Only add if we have at least a name
    if (name) {
      staff.push({ 
        name, 
        title: title || null, 
        email, 
        phone,
        office,
        category 
      });
    }
  });

  return { staff };
}

// Helper function to extract category from the page
function extractCategory($) {
  // Try to get category from h2 in the body field
  const categoryH2 = $('.field--name-body h2').first();
  if (categoryH2.length) {
    return categoryH2.text().trim();
  }
  
  // Fallback: check for any h2 on the page
  const anyH2 = $('h2').first();
  if (anyH2.length) {
    return anyH2.text().trim();
  }
  
  return "Staff Directory";
}