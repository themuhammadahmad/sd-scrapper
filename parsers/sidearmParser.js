import * as cheerio from "cheerio";

export default async function sidearmParser(html, url) {
  const $ = cheerio.load(html);
  if (!$(".sidearm-table").length) return null;

  const staff = [];
  let currentCategory = "";

  $(".sidearm-table tbody tr").each((i, el) => {
    const $row = $(el);
    
    // Check if this is a category row
    if ($row.hasClass("sidearm-staff-category")) {
      currentCategory = $row.find(".fake-heading").text().trim();
      return;
    }
    
    // Check if this is a staff member row
    if ($row.hasClass("sidearm-staff-member")) {
      const name = $row.find('a[aria-label*=","]').text().trim();
      const title = $row.find('td:nth-child(2)').text().trim();
      
      // Extract email from the script
      let email = null;
      const emailScript = $row.find('script').html();
      if (emailScript) {
        // Look for the email pattern in the script
        const emailMatch = emailScript.match(/var full_email = ['"]([^'"]+)['"]/);
        if (emailMatch) {
          email = emailMatch[1];
        } else {
          // Alternative pattern: look for firstHalf and secondHalf variables
          const firstHalfMatch = emailScript.match(/var firstHalf = ['"]([^'"]+)['"]/);
          const secondHalfMatch = emailScript.match(/var secondHalf = ['"]([^'"]+)['"]/);
          if (firstHalfMatch && secondHalfMatch) {
            email = `${firstHalfMatch[1]}@${secondHalfMatch[1]}`;
          }
        }
      }
      
      // Get phone
      const phoneLink = $row.find('a[href^="tel:"]');
      const phone = phoneLink.length ? phoneLink.attr('href')?.replace('tel:', '') : null;

      if (name) {
        staff.push({ 
          name, 
          title, 
          email, 
          phone,
          category: currentCategory 
        });
      }
    }
  });

  return { staff };
}