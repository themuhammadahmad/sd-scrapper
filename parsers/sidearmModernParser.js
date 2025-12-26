import * as cheerio from "cheerio";

export default async function sidearmModernParser(html, url) {
  const $ = cheerio.load(html);
  
  // Check for the modern Sidearm layout
  if (!$('[data-test-id="staff-directory-archive-view-type-list__root"]').length && 
      !$('[data-test-id="s-person-card-list__root"]').length) {
    return null;
  }

  const staff = [];
  const categoryCounts = {};
  
  // Find the main container
  const $mainContainer = $('[data-test-id="staff-directory-archive-view-type-list__root"]');
  
  // Track seen staff members to avoid duplicates
  const seenStaff = new Set();
  
  // Method 1: Process by category sections
  console.log('🔍 Starting category-based processing...');
  
  // Find all category headers
  const $categoryHeaders = $mainContainer.find('[data-test-id="staff-directory-archive-view-type-list__title"]');
  console.log(`📊 Found ${$categoryHeaders.length} category headers`);
  
  if ($categoryHeaders.length > 0) {
    // Process each category section
    $categoryHeaders.each((index, headerEl) => {
      const $header = $(headerEl);
      const category = $header.text().trim();
      const $categoryContainer = $header.closest('.bg-primary, div');
      
      console.log(`\n📁 Processing category: "${category}"`);
      
      // Get staff cards that belong to this category
      let $staffCards = $categoryContainer.nextAll('[data-test-id="s-person-card-list__root"]');
      
      // Stop at next category header
      const nextCategoryIndex = index + 1;
      if (nextCategoryIndex < $categoryHeaders.length) {
        const $nextHeader = $($categoryHeaders[nextCategoryIndex]);
        $staffCards = $staffCards.filter((i, el) => {
          const $el = $(el);
          return $el.index() < $nextHeader.closest('div').index();
        });
      }
      
      console.log(`   Found ${$staffCards.length} staff cards for this category`);
      
      // Process each staff card
      $staffCards.each((i, cardEl) => {
        const $card = $(cardEl);
        const staffKey = getStaffKey($card);
        
        if (!seenStaff.has(staffKey)) {
          processStaffCard($card, category);
          seenStaff.add(staffKey);
          categoryCounts[category] = (categoryCounts[category] || 0) + 1;
        } else {
          console.log(`   ⚠️ Duplicate skipped: ${extractName($card)}`);
        }
      });
    });
  }
  
  // Method 2: Process any remaining unprocessed staff cards
  const $allStaffCards = $mainContainer.find('[data-test-id="s-person-card-list__root"]');
  const unprocessedCards = $allStaffCards.filter((i, el) => {
    const $el = $(el);
    return !seenStaff.has(getStaffKey($el));
  });
  
  if (unprocessedCards.length > 0) {
    console.log(`\n⚠️ Found ${unprocessedCards.length} unprocessed staff cards (no category header)`);
    
    // Try to assign categories based on proximity to headers
    unprocessedCards.each((i, cardEl) => {
      const $card = $(cardEl);
      const category = findNearestCategory($card, $categoryHeaders);
      const staffKey = getStaffKey($card);
      
      if (!seenStaff.has(staffKey)) {
        processStaffCard($card, category || "Uncategorized");
        seenStaff.add(staffKey);
        categoryCounts[category || "Uncategorized"] = (categoryCounts[category || "Uncategorized"] || 0) + 1;
      }
    });
  }
  
  // Final category statistics
  console.log('\n📈 FINAL CATEGORY DISTRIBUTION:');
  console.log('================================');
  Object.entries(categoryCounts).forEach(([category, count]) => {
    console.log(`   "${category}": ${count} members`);
  });
  console.log(`================================`);
  console.log(`   TOTAL: ${staff.length} unique staff members`);
  console.log(`   CATEGORIES: ${Object.keys(categoryCounts).length}`);
  
  // Check for the problematic Wrestling category
  const wrestlingCategories = Object.keys(categoryCounts).filter(cat => 
    cat.toLowerCase().includes('wrestling')
  );
  
  if (wrestlingCategories.length > 0) {
    console.log(`\n⚠️ WRESTLING CATEGORY ANALYSIS:`);
    wrestlingCategories.forEach(cat => {
      console.log(`   "${cat}": ${categoryCounts[cat]} members`);
      
      // Show sample of wrestling staff
      const wrestlingStaff = staff.filter(p => p.category === cat).slice(0, 5);
      if (wrestlingStaff.length > 0) {
        console.log(`   Sample members:`);
        wrestlingStaff.forEach(person => {
          console.log(`     - ${person.name} (${person.title})`);
        });
      }
    });
  }
  
  return { staff };

  // Helper functions
  function getStaffKey($card) {
    const name = extractName($card);
    const email = extractEmail($card);
    return `${name}|${email}`;
  }
  
  function findNearestCategory($card, $categoryHeaders) {
    if ($categoryHeaders.length === 0) return "Staff Directory";
    
    const cardPosition = $card.index();
    let closestCategory = "Staff Directory";
    let minDistance = Infinity;
    
    $categoryHeaders.each((i, headerEl) => {
      const $header = $(headerEl);
      const headerPosition = $header.index();
      const distance = Math.abs(cardPosition - headerPosition);
      
      if (distance < minDistance && cardPosition > headerPosition) {
        minDistance = distance;
        closestCategory = $header.text().trim();
      }
    });
    
    return closestCategory;
  }
  
  function processStaffCard($card, category) {
    const name = extractName($card);
    if (!name || name.trim() === '') return null;
    
    const title = extractTitle($card);
    const email = extractEmail($card);
    const phone = extractPhone($card);
    const bioLink = extractBioLink($card, url);
    
    const person = { 
      name: name.trim(), 
      title: title || null, 
      email, 
      phone,
      bioLink,
      category: category || "Uncategorized"
    };
    
    staff.push(person);
    return person;
  }
  
  // Keep all existing extraction functions (extractName, extractTitle, etc.)
  function extractName($card) {
    const nameSelectors = [
      'h4',
      '[data-test-id="s-person-details__personal-single-line-person-link"] h4',
      '.s-person-details__personal-single-line h4'
    ];
    
    for (const selector of nameSelectors) {
      const $name = $card.find(selector);
      if ($name.length) {
        const nameText = $name.first().text().trim();
        if (nameText) return nameText;
      }
    }
    
    const $bioLink = $card.find('a[aria-label*="full bio"]');
    if ($bioLink.length) {
      const ariaLabel = $bioLink.attr('aria-label');
      if (ariaLabel) {
        const match = ariaLabel.match(/^(.*?)\s+full bio$/i);
        if (match) return match[1].trim();
      }
    }
    
    return '';
  }
  
  function extractTitle($card) {
    const titleSelectors = [
      '.s-person-details__position div',
      '[data-test-id="s-person-details__position"] div',
      '.s-person-details__position'
    ];
    
    for (const selector of titleSelectors) {
      const $title = $card.find(selector);
      if ($title.length) {
        const titleText = $title.first().text().trim();
        if (titleText && titleText.length > 2) {
          return titleText.replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
        }
      }
    }
    
    return null;
  }
  
  function extractEmail($card) {
    const emailSelectors = [
      'a[href^="mailto:"]',
      '[data-test-id="s-person-card-list__content-contact-det-email"] a[href^="mailto:"]'
    ];
    
    for (const selector of emailSelectors) {
      const $email = $card.find(selector);
      if ($email.length) {
        const email = $email.attr('href')?.replace('mailto:', '').trim();
        if (email) return email;
      }
    }
    
    return null;
  }
  
  function extractPhone($card) {
    const phoneSelectors = [
      'a[href^="tel:"]',
      '[data-test-id="s-person-card-list__content-contact-det-phone"] a[href^="tel:"]'
    ];
    
    for (const selector of phoneSelectors) {
      const $phone = $card.find(selector);
      if ($phone.length) {
        const phone = $phone.attr('href')?.replace('tel:', '').trim();
        if (phone) return phone.replace(/[^\d-]/g, '');
      }
    }
    
    return null;
  }
  
  function extractBioLink($card, baseUrl) {
    const bioLinkSelectors = [
      'a[href*="/staff-directory/"]',
      '[data-test-id="s-person-details__thumbnail-link"]'
    ];
    
    for (const selector of bioLinkSelectors) {
      const $link = $card.find(selector);
      if ($link.length) {
        const href = $link.attr('href');
        if (href && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
          if (href && !href.startsWith('http')) {
            try {
              return new URL(href, baseUrl).href;
            } catch (e) {
              return href;
            }
          }
          return href;
        }
      }
    }
    
    return null;
  }
}