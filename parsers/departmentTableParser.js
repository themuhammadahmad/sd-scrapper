import * as cheerio from "cheerio";

export default async function departmentTableParser(html, url) {
  const $ = cheerio.load(html);
  
  // Check if this is the department table format
  if (!$(".department-table").length) {
    console.log("table does not exist");
    return null;
  };

  const staff = [];
  let currentCategory = "";

  // Find all department sections
  $(".department-section").each((sectionIndex, section) => {
    const $section = $(section);
    
    // Get the category from the table header
    currentCategory = $section.find(".dept-heading-row th").text().trim();
    
    // Process each staff row in the table body
    $section.find("tbody tr[data-name]").each((rowIndex, row) => {
      const $row = $(row);
      
      // Extract data from data attributes (more reliable)
      const nameFromAttr = $row.attr("data-name")?.trim();
      const positionFromAttr = $row.attr("data-position")?.trim();
      const deptFromAttr = $row.attr("data-dept")?.trim();
      const emailFromAttr = $row.attr("data-email")?.trim();
      
      // Extract from HTML structure as fallback
      // Name from the first column
      const nameFromHtml = $row.find("td:first-child .cell-content a").text().trim();
      const titleFromHtml = $row.find("td:first-child .subtitle").text().trim();
      
      // Phone from second column
      const phone = $row.find("td:nth-child(2)").text().trim() || null;
      
      // Email from third column (check both data attribute and mailto link)
      let email = emailFromAttr;
      if (!email) {
        const emailLink = $row.find("td:nth-child(3) a[href^='mailto:']");
        if (emailLink.length) {
          email = emailLink.attr("href")?.replace("mailto:", "").trim();
        } else {
          // Try to extract from text
          const emailText = $row.find("td:nth-child(3)").text().trim();
          const emailMatch = emailText.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
          if (emailMatch) {
            email = emailMatch[0];
          }
        }
      }
      
      // Use data attributes first, fall back to HTML extraction
      const name = nameFromAttr || nameFromHtml;
      const title = positionFromAttr || titleFromHtml;
      const category = deptFromAttr || currentCategory;
      
      // Clean up the name (remove asterisk if present in HTML but not in data attribute)
      let cleanedName = name;
      if (nameFromHtml.includes("*") && !nameFromAttr?.includes("*")) {
        cleanedName = nameFromHtml;
      }
      
      // Only add if we have a name
      if (cleanedName && cleanedName !== "") {
        staff.push({
          name: cleanedName,
          title: title || null,
          email: email || null,
          phone: phone,
          category: category || null
        });
      }
    });
  });

  return staff.length > 0 ? { staff } : null;
}