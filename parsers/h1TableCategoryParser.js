import * as cheerio from "cheerio";

export default async function h1TableCategoryParser(html, url) {
  const $ = cheerio.load(html);
  
  // ==================== IDENTIFICATION LOGIC ====================
  // Check if this is the h1-table pattern structure
  // We need to look for multiple h1 elements followed by .roster tables
  
  // First, check if we have tables with class "roster"
  const rosterTables = $('table.roster');
  if (rosterTables.length === 0) {
    return null; // Not our structure
  }
  
  // Check if we have h1 elements preceding these tables
  // Look for the pattern: any h1 that has a .roster table as its next sibling
  let hasH1TablePattern = false;
  $('h1').each((i, h1) => {
    const $h1 = $(h1);
    // Get the next sibling element (could be table or other elements in between)
    let nextElement = $h1.next();
    
    // Skip through whitespace/text nodes and other elements to find the next meaningful element
    while (nextElement.length && nextElement.get(0).tagName !== 'table') {
      nextElement = nextElement.next();
    }
    
    if (nextElement.length && nextElement.hasClass('roster')) {
      hasH1TablePattern = true;
      return false; // Break out of the each loop
    }
  });
  
  // Alternative: Check if we're in a mainbody element (as you mentioned)
  const inMainbody = $('#mainbody').length > 0 || $('main').length > 0;
  
  // If we don't have the h1-table pattern and not in mainbody, this isn't our parser
  if (!hasH1TablePattern && !inMainbody) {
    return null;
  }
  
  // ==================== PARSING LOGIC ====================
  const staff = [];
  let currentCategory = "Staff Directory"; // Default
  
  // Get all h1 elements and process them with their following tables
  $('h1').each((h1Index, h1El) => {
    const $h1 = $(h1El);
    currentCategory = $h1.text().trim();
    
    // Find the next .roster table after this h1
    let $nextElement = $h1.next();
    let foundTable = false;
    
    // Search for the table in the next siblings (skip other elements)
    while ($nextElement.length && !foundTable) {
      if ($nextElement.is('table.roster')) {
        // Found our table - parse it
        parseRosterTable($nextElement, currentCategory);
        foundTable = true;
        break;
      }
      
      // Check children if the next element is a container (like div)
      if ($nextElement.find('table.roster').length) {
        parseRosterTable($nextElement.find('table.roster').first(), currentCategory);
        foundTable = true;
        break;
      }
      
      $nextElement = $nextElement.next();
    }
  });
  
  // Also parse any .roster tables we haven't processed yet
  $('table.roster').each((tableIndex, tableEl) => {
    const $table = $(tableEl);
    
    // Check if this table was already processed
    const alreadyProcessed = staff.some(person => 
      $table.find(`a:contains("${person.name}")`).length > 0
    );
    
    if (!alreadyProcessed) {
      // Try to find the preceding h1 for this table
      let $prevElement = $table.prev();
      let category = "Staff Directory";
      
      // Walk backwards to find the closest h1
      while ($prevElement.length) {
        if ($prevElement.is('h1')) {
          category = $prevElement.text().trim();
          break;
        }
        $prevElement = $prevElement.prev();
      }
      
      parseRosterTable($table, category);
    }
  });
  
  function parseRosterTable($table, category) {
    // Parse table rows (skip the header row)
    $table.find('tr:not(.roster-header)').each((rowIndex, rowEl) => {
      const $row = $(rowEl);
      const $cells = $row.find('td');
      
      if ($cells.length >= 4) { // Need at least name, title, phone, email columns
        // Column 0: Name (with possible link)
        let name = '';
        const $nameLink = $cells.eq(0).find('a');
        if ($nameLink.length) {
          name = $nameLink.text().trim();
        } else {
          name = $cells.eq(0).text().trim();
        }
        
        // Column 1: Title
        let title = $cells.eq(1).text().trim();
        // Clean up title
        title = title.replace(/\s+/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
        
        // Column 2: Phone
        let phone = $cells.eq(2).text().trim();
        // Clean phone - remove non-digit except dash
        phone = phone.replace(/[^\d-]/g, '').trim();
        if (phone && phone.match(/^\d{10}$/)) {
          phone = `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`;
        }
        
        // Column 3: Email
        let email = null;
        const $emailLink = $cells.eq(3).find('a[href^="mailto:"]');
        if ($emailLink.length) {
          email = $emailLink.attr('href')?.replace('mailto:', '').trim();
        } else {
          // Fallback: check text content
          const emailText = $cells.eq(3).text().trim();
          if (emailText && emailText.includes('@')) {
            email = emailText.trim();
          }
        }
        
        // Extract bio link from name column
        let bioLink = null;
        if ($nameLink.length) {
          const href = $nameLink.attr('href');
          if (href && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
            bioLink = href;
            // Make it absolute if it's relative
            if (bioLink && !bioLink.startsWith('http')) {
              const baseUrl = new URL(url);
              bioLink = new URL(bioLink, baseUrl.origin).href;
            }
          }
        }
        
        // Only add if we have a name
        if (name && name !== '') {
          staff.push({ 
            name, 
            title: title || null, 
            email, 
            phone,
            bioLink,
            category: category || "Staff Directory"
          });
        }
      }
    });
  }
  
  // Remove duplicates based on name, email, and category combination
  const uniqueStaff = [];
  const seen = new Set();
  
  staff.forEach(person => {
    const key = `${person.name}|${person.email}|${person.category}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueStaff.push(person);
    }
  });

  return { staff: uniqueStaff };
}