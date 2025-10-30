import * as cheerio from "cheerio";

export default async function drupalPersonParser(html, url) {
  const $ = cheerio.load(html);
  
  // Check if this is the Drupal person directory format
  if (!$('.view-automated-list').length || !$('.row-node-type--person').length) {
    return null;
  }

  const staff = [];

  // Process each person row
  $('.row-node-type--person').each((i, personEl) => {
    const $person = $(personEl);
    
    // Extract name
    const name = $person.find('.views-field-title span').text().trim();
    
    // Extract titles/roles (can be multiple)
    const titles = [];
    $person.find('.field--name-field-person-role .paragraph--type--person-role').each((j, roleEl) => {
      const title = $(roleEl).text().trim();
      if (title) {
        titles.push(title);
      }
    });
    
    // Use first title as primary, or join all if multiple
    const title = titles.length > 0 ? (titles.length === 1 ? titles[0] : titles.join(', ')) : null;
    
    // Extract email
    let email = null;
    const emailLink = $person.find('.field--name-field-email a[href^="mailto:"]');
    if (emailLink.length) {
      email = emailLink.attr('href')?.replace('mailto:', '') || emailLink.text().trim();
    }
    
    // Extract phone
    let phone = null;
    const phoneLink = $person.find('.field--name-field-phone-number a[href^="tel:"]');
    if (phoneLink.length) {
      phone = phoneLink.attr('href')?.replace('tel:', '') || phoneLink.text().trim();
    }
    
    // Extract office location
    let office = null;
    const officeElement = $person.find('.field--name-field-building-name .office-location');
    if (officeElement.length) {
      office = officeElement.text().trim();
    }
    
    // Only add if we have at least a name
    if (name) {
      staff.push({ 
        name, 
        title, 
        email, 
        phone,
        office, // Additional field for location
        category: null // No categories in this format
      });
    }
  });

  return { staff };
}