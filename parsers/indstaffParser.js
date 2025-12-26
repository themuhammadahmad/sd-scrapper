import * as cheerio from "cheerio";

export default async function indStaffParser(html, url) {
  const $ = cheerio.load(html);
  
  // Check if this page uses the ind-staff layout
  if (!$('.ind-staff').length) return null;

  const staff = [];
  
  // Process each staff member div
  $('.ind-staff').each((i, el) => {
    const $staff = $(el);
    
    // Extract name
    const firstName = $staff.find('.staff-fname-mi').text().trim();
    const lastName = $staff.find('.staff-lname').text().trim();
    const name = `${firstName} ${lastName}`.trim();
    
    // Extract title
    const title = $staff.find('.staff-title').text().trim();
    
    // Extract phone
    let phone = null;
    const phoneLink = $staff.find('a[href^="tel:"]');
    if (phoneLink.length) {
      phone = phoneLink.attr('href')?.replace('tel:', '');
    }
    
    // Extract email
    let email = null;
    const emailLink = $staff.find('a[href^="mailto:"]');
    if (emailLink.length) {
      email = emailLink.attr('href')?.replace('mailto:', '');
    }
    
    // Extract photo URL if needed
    let photoUrl = null;
    const photoDiv = $staff.find('.staff-photo');
    if (photoDiv.length) {
      const style = photoDiv.attr('style');
      if (style) {
        const match = style.match(/url\(([^)]+)\)/);
        if (match) {
          photoUrl = match[1];
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
        photo: photoUrl, // Optional: include photo URL if you want it
        category: null // This format doesn't seem to have categories
      });
    }
  });

  return { staff };
}