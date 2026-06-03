// parsers/rioGrandeParser.js
import * as cheerio from "cheerio";

export default async function rioGrandeParser(html, url) {
  const $ = cheerio.load(html);
  
  // Check if this is the Rio Grande staff directory structure
  const hasStaffDirectory = $('.page-content.staff-directory, section.staff-directory').length > 0;
  if (!hasStaffDirectory) return null;
  
  const staff = [];
  let currentCategory = "";
  
  // Find all staff directory sections
  const sections = $('section.staff-directory');
  
  if (sections.length === 0) {
    // Try alternative: look for h2 headings followed by cards
    const headings = $('h2');
    if (headings.length === 0) return null;
    
    // Process by h2 headings
    headings.each((idx, heading) => {
      currentCategory = $(heading).text().trim();
      if (!currentCategory) return;
      
      // Find staff cards after this heading
      let staffContainer = $(heading).nextUntil('h2', '.row, .staff-directory');
      if (staffContainer.length === 0) {
        staffContainer = $(heading).parent().find('.row, [class*="row"]');
      }
      
      const cards = staffContainer.find('.card');
      if (cards.length === 0) return;
      
      cards.each((cardIdx, card) => {
        const member = extractMember($, card, url);
        if (member.name) {
          staff.push({
            ...member,
            category: currentCategory
          });
        }
      });
    });
    
    return staff.length > 0 ? { staff } : null;
  }
  
  // Process each section
  sections.each((sectionIdx, section) => {
    // Get category name from aria-label or h2
    currentCategory = $(section).attr('aria-label') || 
                     $(section).find('h2').first().text().trim() ||
                     "Uncategorized";
    currentCategory = currentCategory.replace(/&amp;/g, '&').trim();
    
    // Find all staff cards within this section
    const cards = $(section).find('.card');
    
    cards.each((cardIdx, card) => {
      const member = extractMember($, card, url);
      if (member.name) {
        staff.push({
          ...member,
          category: currentCategory
        });
      }
    });
  });
  
  return staff.length > 0 ? { staff } : null;
}

/**
 * Extract individual staff member data from a card element
 */
function extractMember($, card, baseUrl) {
  const member = {
    name: "",
    title: "",
    email: null,
    phone: null,
    profileUrl: null
  };
  
  // Extract Name from card-title
  const nameElement = $(card).find('.card-title a, .card-title');
  if (nameElement.length > 0) {
    member.name = cleanText(nameElement.first().text());
    
    // Extract profile URL if exists
    const profileLink = $(card).find('.card-title a');
    if (profileLink.length > 0) {
      let href = profileLink.attr('href');
      if (href) {
        // Resolve relative URLs
        if (href.startsWith('/')) {
          const baseUrlObj = new URL(baseUrl);
          member.profileUrl = `${baseUrlObj.protocol}//${baseUrlObj.host}${href}`;
        } else if (!href.startsWith('http')) {
          member.profileUrl = `${baseUrl.replace(/\/$/, '')}/${href}`;
        } else {
          member.profileUrl = href;
        }
      }
    }
  }
  
  // Extract Title from card-text
  const cardText = $(card).find('.card-text');
  if (cardText.length > 0) {
    // Title is usually in the first paragraph
    const titleParagraph = cardText.find('p.mb-0').first();
    if (titleParagraph.length > 0) {
      let title = titleParagraph.text().trim();
      // Remove email/phone icons that might be in the text
      title = title.replace(/<[^>]*>/g, '').trim();
      member.title = cleanText(title) || null;
    }
    
    // Find contact info container
    const contactDiv = cardText.find('.mt-2');
    if (contactDiv.length > 0) {
      // Extract email
      const emailLink = contactDiv.find('a[href^="mailto:"]');
      if (emailLink.length > 0) {
        member.email = emailLink.attr('href').replace('mailto:', '').trim();
      }
      
      // Extract phone
      const phoneLink = contactDiv.find('a[href^="tel:"]');
      if (phoneLink.length > 0) {
        let phone = phoneLink.attr('href').replace('tel:', '').trim();
        member.phone = formatPhoneNumber(phone);
      }
    }
  }
  
  // Try alternative extraction if no title found
  if (!member.title) {
    const altTitle = $(card).find('.card-text p:first-child, .staff-title, .position');
    if (altTitle.length > 0) {
      member.title = cleanText(altTitle.first().text()) || null;
    }
  }
  
  // Try alternative email extraction
  if (!member.email) {
    const altEmails = $(card).find('a[href*="mailto"]');
    if (altEmails.length > 0) {
      member.email = altEmails.first().attr('href').replace('mailto:', '').split('?')[0].trim();
    }
  }
  
  // Try alternative phone extraction
  if (!member.phone) {
    const altPhones = $(card).find('a[href*="tel"]');
    if (altPhones.length > 0) {
      let phone = altPhones.first().attr('href').replace('tel:', '').trim();
      member.phone = formatPhoneNumber(phone);
    }
  }
  
  return member;
}

/**
 * Clean text by removing extra whitespace
 */
function cleanText(text) {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Format phone number consistently
 */
function formatPhoneNumber(phone) {
  if (!phone) return null;
  // Remove all non-digit characters except +
  let cleaned = phone.replace(/[^\d+]/g, '');
  
  // Format US numbers (10 digits)
  if (cleaned.length === 10 && !cleaned.startsWith('+')) {
    return `(${cleaned.slice(0,3)}) ${cleaned.slice(3,6)}-${cleaned.slice(6)}`;
  }
  
  // Format numbers with country code
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+${cleaned.slice(0,1)} (${cleaned.slice(1,4)}) ${cleaned.slice(4,7)}-${cleaned.slice(7)}`;
  }
  
  return phone;
}