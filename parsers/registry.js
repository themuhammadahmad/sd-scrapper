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


export async function runParsers(html, url) {
    // console.log(html)
for (const parser of parsers) {
try {
    
const result = await parser(html, url);
if (result && result.staff && result.staff.length > 0) {
return result;
}
} catch (err) {
// ignore and move to next parser
}
}
return { staff: [] };
}