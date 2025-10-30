import * as cheerio from "cheerio";

export default async function h2TableCategoryParser(html, url) {
  const $ = cheerio.load(html);
  
  // Check if this structure has h2 headings followed by tables
  const articleBody = $('.article-body');
  if (!articleBody.length) return null;
  
  // Check if we have the pattern of h2 followed by table with thead
  const hasPattern = articleBody.find('h2 + table.table thead').length > 0;
  if (!hasPattern) return null;

  const staff = [];
  let currentCategory = "";

  // Process all direct children of article-body
  articleBody.contents().each((i, el) => {
    const $el = $(el);
    
    // If it's an h2, set the current category
    if (el.tagName === 'h2') {
      currentCategory = $el.text().trim();
      return;
    }
    
    // If it's a table with the expected structure, process it
    if (el.tagName === 'table' && $el.hasClass('table') && $el.hasClass('table-bordered')) {
      const $table = $el;
      
      // Process each row in tbody
      $table.find('tbody tr').each((j, row) => {
        const $row = $(row);
        const $cells = $row.find('td');
        
        // Skip if not enough cells
        if ($cells.length < 4) return;
        
        // Extract name from first cell
        let name = "";
        const nameLink = $cells.eq(0).find('a');
        if (nameLink.length) {
          name = nameLink.text().trim();
        } else {
          name = $cells.eq(0).text().trim();
        }
        
        // Extract title from second cell
        const title = $cells.eq(1).text().trim() || null;
        
        // Extract phone from third cell
        let phone = $cells.eq(2).text().trim();
        phone = phone && phone !== '&nbsp;' && phone !== '' ? phone : null;
        
        // Extract email from fourth cell
        let email = null;
        const emailLink = $cells.eq(3).find('a[href^="mailto:"]');
        if (emailLink.length) {
          email = emailLink.attr('href')?.replace('mailto:', '') || null;
        } else {
          // Fallback: check if cell contains email-like text
          const emailText = $cells.eq(3).text().trim();
          if (emailText && emailText.includes('@')) {
            email = emailText;
          }
        }
        
        // Only add if we have a name
        if (name && name !== '') {
          staff.push({
            name,
            title,
            email,
            phone,
            category: currentCategory
          });
        }
      });
    }
  });

  return staff.length > 0 ? { staff } : null;
}