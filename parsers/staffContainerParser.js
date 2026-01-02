import * as cheerio from "cheerio";

export default async function staffMemberParser(html, url) {
  const $ = cheerio.load(html);
  
  // Check if this page has the directory-container and staff-container classes
  if (!$('.directory-container .staff-container').length) return null;
  
  // Also check if there are staff-member elements
  if (!$('.staff-member').length) return null;

  const staff = [];
  
  // Process each staff member
  $('.staff-member').each((i, el) => {
    const $staff = $(el);
    
    // Extract name from data-name attribute (most reliable)
    let name = $staff.attr('data-name') || '';
    
    // Fallback: extract from panel-heading text
    if (!name) {
      name = $staff.find('.panel-heading strong').text().trim();
    }
    
    // Extract title from address > p
    let title = $staff.find('address p').text().trim();
    
    // Clean up title - remove extra whitespace
    title = title.replace(/\s+/g, ' ').trim();
    
    // Extract email
    let email = null;
    const emailLink = $staff.find('a[href^="mailto:"]');
    if (emailLink.length) {
      email = emailLink.attr('href')?.replace('mailto:', '').trim();
    }
    
    // Extract phone - there are multiple phone elements
    let phone = null;
    
    // First try the main phone link with href="tel:"
    const phoneLink = $staff.find('a[href^="tel:"]');
    if (phoneLink.length) {
      phone = phoneLink.attr('href')?.replace('tel:', '').trim();
    }
    
    // Extract extension if available
    let extension = null;
    const extSpan = $staff.find('.text-muted:contains("Ext.")');
    if (extSpan.length) {
      const extText = extSpan.text().trim();
      const extMatch = extText.match(/Ext\.\s*(\d+)/);
      if (extMatch) {
        extension = extMatch[1];
      }
    }
    
    // Extract photo URL if needed
    let photoUrl = null;
    const photoImg = $staff.find('.staff-photo');
    if (photoImg.length) {
      photoUrl = photoImg.attr('src');
    }
    
    // Optional: Extract bio link
    let bioLink = null;
    const bioLinkEl = $staff.find('a[href*="/Staff/Bio/"]');
    if (bioLinkEl.length) {
      const href = bioLinkEl.attr('href');
      bioLink = href?.startsWith('http') ? href : new URL(href, url).href;
    }
    
    // Format phone with extension if available
    let formattedPhone = phone;
    if (phone && extension) {
      formattedPhone = `${phone} ext. ${extension}`;
    }
    
    // Only add if we have at least a name
    if (name && name !== '') {
      staff.push({ 
        name, 
        title: title || null, 
        email, 
        phone: formattedPhone || phone,
        extension: extension || null,
        photo: photoUrl, // Optional
        bio: bioLink, // Optional
        category: null // This format doesn't seem to have categories
      });
    }
  });

  return { staff };
}