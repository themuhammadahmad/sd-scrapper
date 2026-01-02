import * as cheerio from "cheerio";

export default async function rfTeamParser(html, url) {
  const $ = cheerio.load(html);
  
  // Check if this page has the rf-team-completebox class
  if (!$('.rf-team-completebox').length) return null;

  const staff = [];
  
  // Process each staff member card
  $('.rf-team-completebox').each((i, el) => {
    const $card = $(el);
    
    // Extract name from h2 with rf-team-name class
    const name = $card.find('.rf-team-name').text().trim();
    
    // Extract title/designation
    const title = $card.find('.rf-team-designation').text().trim();
    
    // Extract email from mailto link in rf-team-content
    let email = null;
    const emailLink = $card.find('.rf-team-content a[href^="mailto:"]');
    if (emailLink.length) {
      email = emailLink.attr('href')?.replace('mailto:', '').trim();
    }
    
    // Extract phone from rf-team-content text
    let phone = null;
    const contentText = $card.find('.rf-team-content').text();
    
    // Look for phone pattern after "Phone:"
    const phoneMatch = contentText.match(/Phone:\s*([\d\s\(\)\-\.]+)/i);
    if (phoneMatch) {
      phone = phoneMatch[1].trim();
    }
    
    // Extract bio link
    let bioLink = null;
    const bioLinkElement = $card.find('.rf-team-content a:contains("Full Bio")');
    if (bioLinkElement.length) {
      const href = bioLinkElement.attr('href');
      if (href) {
        bioLink = href.startsWith('http') ? href : new URL(href, url).href;
      }
    }
    
    // Extract photo URL
    let photoUrl = null;
    const photoImg = $card.find('.rf-team-img img');
    if (photoImg.length) {
      photoUrl = photoImg.attr('src');
    }
    
    // Extract social media links
    const socialLinks = {};
    $card.find('.social a').each((j, link) => {
      const href = $(link).attr('href');
      const iconClass = $(link).find('i').attr('class') || '';
      
      // Determine platform from icon class
      let platform = 'other';
      if (iconClass.includes('fa-facebook')) platform = 'facebook';
      else if (iconClass.includes('fa-twitter')) platform = 'twitter';
      else if (iconClass.includes('fa-instagram')) platform = 'instagram';
      else if (iconClass.includes('fa-linkedin')) platform = 'linkedin';
      else if (iconClass.includes('fa-pinterest')) platform = 'pinterest';
      
      // Only add if there's a valid href (not empty or placeholder)
      if (href && href.trim() && !href.includes('http://Senior%20Associate')) {
        socialLinks[platform] = href.trim();
      }
    });
    
    // Only add if we have at least a name
    if (name && name !== '') {
      staff.push({ 
        name, 
        title: title || null, 
        email, 
        phone,
        bio: bioLink,
        photo: photoUrl,
        social: Object.keys(socialLinks).length > 0 ? socialLinks : null,
        category: null
      });
    }
  });

  return staff.length > 0 ? { staff } : null;
}