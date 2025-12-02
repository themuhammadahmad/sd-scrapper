// parsers/registry.js
import sidearmParser from "./sidearmParser.js";
import genericTableParser from "./genericTableParser.js";
import heuristicsParser from "./heuristicsParser.js";
import separateTableParser from "./separateTableParser.js"; // Add this import
import multiTbodyParser from "./multiTbodyParser.js"; // Add this import
import cardBasedParser from "./cardBasedParser.js"; // Add this import
import tableSeparatorParser from "./tableSeparatorParser.js"; // Add this import
import subtitleCategoryParse from "./subtitleCategoryParse.js"; // Add this import
import h2TableCategoryParser from "./h2TableCategoryParser.js"; // Add this import
import sectionStaffDirectoryParser from "./sectionStaffDirectoryParser.js"; // Add this import
import bobcatsTableParser from "./bobcatsTableParser.js"; // Add this import
import vvcTableParser from "./vvcTableParser.js"; // Add this import
import drupalPersonParser from "./drupalPersonParser.js"; // Add this import
import albanyDirectoryParser from "./albanyDirectoryParser.js"; // Add this import


// Parsers are async functions that take HTML + URL and return { staff: [...] }
const parsers = [
sidearmParser,
separateTableParser,
multiTbodyParser,
cardBasedParser,
subtitleCategoryParse,
tableSeparatorParser,
h2TableCategoryParser,
sectionStaffDirectoryParser,
bobcatsTableParser,
vvcTableParser,
drupalPersonParser,
albanyDirectoryParser
// genericTableParser,
// heuristicsParser,
];


// export async function runParsers(html, url) {
//     // console.log(html)
// for (const parser of parsers) {
// try {
    
// const result = await parser(html, url);
// if (result && result.staff && result.staff.length > 0) {
// return result;
// }
// } catch (err) {
// // ignore and move to next parser
// }
// }
// return { staff: [] };
// }
// Updated runParsers to return which parser worked
async function runParsersWithNames(html, url) {
  const parsers = [
    { name: 'sidearmParser', fn: (await import('./parsers/sidearmParser.js')).default },
    { name: 'genericTableParser', fn: (await import('./parsers/genericTableParser.js')).default },
    { name: 'heuristicsParser', fn: (await import('./parsers/heuristicsParser.js')).default },
    { name: 'separateTableParser', fn: (await import('./parsers/separateTableParser.js')).default },
    { name: 'multiTbodyParser', fn: (await import('./parsers/multiTbodyParser.js')).default },
    { name: 'cardBasedParser', fn: (await import('./parsers/cardBasedParser.js')).default },
    { name: 'tableSeparatorParser', fn: (await import('./parsers/tableSeparatorParser.js')).default },
    { name: 'subtitleCategoryParse', fn: (await import('./parsers/subtitleCategoryParse.js')).default },
    { name: 'h2TableCategoryParser', fn: (await import('./parsers/h2TableCategoryParser.js')).default },
    { name: 'sectionStaffDirectoryParser', fn: (await import('./parsers/sectionStaffDirectoryParser.js')).default },
    { name: 'bobcatsTableParser', fn: (await import('./parsers/bobcatsTableParser.js')).default },
    { name: 'vvcTableParser', fn: (await import('./parsers/vvcTableParser.js')).default },
    { name: 'drupalPersonParser', fn: (await import('./parsers/drupalPersonParser.js')).default },
    { name: 'albanyDirectoryParser', fn: (await import('./parsers/albanyDirectoryParser.js')).default }
  ];

  for (const parser of parsers) {
    try {
      const result = await parser.fn(html, url);
      if (result && result.staff && result.staff.length > 0) {
        console.log(`✅ Parser ${parser.name} worked! Found ${result.staff.length} staff`);
        return {
          ...result,
          parserName: parser.name
        };
      }
    } catch (err) {
      // ignore and move to next parser
      console.log(`❌ Parser ${parser.name} failed:`, err.message);
    }
  }
  
  return { staff: [], parserName: null };
}
export async function runParsers(html, url) {
  const result = await runParsersWithNames(html, url);
  return result;
}