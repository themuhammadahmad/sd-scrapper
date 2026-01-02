import * as cheerio from "cheerio";

export default async function coachCardParser(html, url) {
  const $ = cheerio.load(html);
  
  // Check if this page has coach-card elements
  if (!$('.coach-card').length) return null;

  const staff = [];
  
  // Process each coach card
  $('.coach-card').each((i, el) => {
    const $card = $(el);
    
    // Extract name from .coach-name
    const name = $card.find('.coach-name').text().trim();
    
    // Extract title/position from .coach-position
    const title = $card.find('.coach-position').text().trim();
    
    // Extract email - multiple approaches
    let email = null;
    
    // Method 1: From mailto link
    const emailLink = $card.find('a[href^="mailto:"]');
    if (emailLink.length) {
      email = emailLink.attr('href')?.replace('mailto:', '').trim();
    }
    
    // Method 2: From alt attribute on email button
    if (!email) {
      const emailAlt = emailLink.attr('alt');
      if (emailAlt && emailAlt.includes('@')) {
        email = emailAlt;
      }
    }
    
    // Method 3: Look for email in text content
    if (!email) {
      const contactText = $card.find('.coach-contact').text();
      const emailMatch = contactText.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
      if (emailMatch) {
        email = emailMatch[0];
      }
    }
    
    // Extract photo URL - check multiple sources
    let photoUrl = null;
    
    // Primary photo from img src
    const photoImg = $card.find('img.coach-photo');
    if (photoImg.length) {
      photoUrl = photoImg.attr('src');
      
      // Check for fallback images in data attributes
      if (!photoUrl || photoUrl.includes('no-picture')) {
        const fallback1 = photoImg.attr('data-fallback1');
        const fallback2 = photoImg.attr('data-fallback2');
        const fallback3 = photoImg.attr('data-fallback3');
        
        // Use first available fallback
        if (fallback1 && !fallback1.includes('no-picture')) {
          photoUrl = fallback1;
        } else if (fallback2 && !fallback2.includes('no-picture')) {
          photoUrl = fallback2;
        } else if (fallback3 && !fallback3.includes('no-picture')) {
          photoUrl = fallback3;
        }
      }
    }
    
    // Extract phone if available (not in example but checking anyway)
    let phone = null;
    
    // Check for phone in contact section
    const contactText = $card.find('.coach-contact').text();
    const phoneMatch = contactText.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
    if (phoneMatch) {
      phone = phoneMatch[0];
    }
    
    // Check for tel: links
    const phoneLink = $card.find('a[href^="tel:"]');
    if (phoneLink.length) {
      phone = phoneLink.attr('href')?.replace('tel:', '').trim();
    }
    
    // Only add if we have at least a name
    if (name && name !== '') {
      staff.push({ 
        name, 
        title: title || null, 
        email, 
        phone,
        photo: photoUrl,
        category: null // This format doesn't seem to have categories
      });
    }
  });

  return staff.length > 0 ? { staff } : null;
}