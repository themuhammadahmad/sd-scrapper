// parsers/genericTableParser.js
import * as cheerio from "cheerio";


export default async function genericTableParser(html, url) {
const $ = cheerio.load(html);


let staff = [];
$("table tr").each((i, row) => {

const cells = $(row).find("td");
if (cells.length >= 2) {
const name = $(cells[0]).text().trim();
const title = $(cells[1]).text().trim();
const email = $(cells).find("a[href^='mailto']").attr("href");
const phone = $(cells).filter((i, c) => $(c).text().match(/\d{3}[- ]?\d{3}/)).text().trim();


if (name) staff.push({ name, title, email, phone });
}
});


return staff.length ? { staff } : null;
}