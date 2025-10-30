import * as cheerio from "cheerio";

export default async function cardBasedParser(html, url) {
  const $ = cheerio.load(html);
  
  // Check if this is the card-based staff directory
  const listPanel = $('#listPanel');
  if (!listPanel.length || 
      !listPanel.find('[data-test-id="staff-directory-archive-view-type-list__title"]').length) {
    return null;
  }

  const staff = [];
  let currentCategory = "";

  // Process all direct children of the main container
  listPanel.children().each((i, el) => {
    const $el = $(el);

    // Check if this is a category header
    if ($el.hasClass('bg-primary') && 
        $el.find('[data-test-id="staff-directory-archive-view-type-list__title"]').length) {
      
      currentCategory = $el.find('[data-test-id="staff-directory-archive-view-type-list__title"]').text().trim();
      return; // Continue to next element
    }

    // Check if this is a staff member card
    if ($el.hasClass('s-person-card') && 
        $el.attr('data-test-id') === 's-person-card-list__root') {
      
      // Extract name
      let name = "";
      const nameLink = $el.find('[data-test-id="s-person-details__personal-single-line-person-link"] h4');
      if (nameLink.length) {
        name = nameLink.text().trim();
      } else {
        // Fallback: try to find name in other locations
        const fallbackName = $el.find('.s-person-details__personal-single-line h4').text().trim();
        if (fallbackName) {
          name = fallbackName;
        }
      }

      // Extract title/position
      let title = "";
      const positionDiv = $el.find('.s-person-details__position div');
      if (positionDiv.length) {
        title = positionDiv.html() || positionDiv.text().trim();
        // Clean up title - remove HTML tags if present
        title = title.replace(/<br\s*\/?>/gi, ' - ').replace(/<[^>]*>/g, '').trim();
        // Clean up any extra spaces around the dash
        title = title.replace(/\s*-\s*/g, ' - ');
      }

      // Extract email
      let email = null;
      const emailLink = $el.find('a[href^="mailto:"]');
      if (emailLink.length) {
        email = emailLink.attr('href')?.replace('mailto:', '') || null;
      }

      // Extract phone
      let phone = null;
      const phoneLink = $el.find('a[href^="tel:"]');
      if (phoneLink.length) {
        phone = phoneLink.attr('href')?.replace('tel:', '') || null;
        
        // Format phone number if needed
        if (phone && phone.match(/^\d{10}$/)) {
          phone = `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`;
        }
      } else {
        // Alternative: look for phone text in the phone section
        const phoneSection = $el.find('[data-test-id="s-person-card-list__content-contact-det-phone"]');
        if (phoneSection.length) {
          const phoneText = phoneSection.find('a').text().trim() || phoneSection.text().trim();
          if (phoneText && phoneText.match(/\d/)) {
            phone = phoneText;
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
          category: currentCategory 
        });
      }
    }
  });

  return { staff };
}