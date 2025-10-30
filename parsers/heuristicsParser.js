// parsers/heuristicsParser.js
import * as cheerio from "cheerio";


export default async function heuristicsParser(html, url) {
const $ = cheerio.load(html);


const staff = [];
$("p, li, div").each((i, el) => {
const text = $(el).text().trim();
if (/@/.test(text) && /[A-Z][a-z]+ [A-Z][a-z]+/.test(text)) {
staff.push({
name: text.match(/[A-Z][a-z]+ [A-Z][a-z]+/)[0],
title: text,
email: text.match(/[\w._%+-]+@[\w.-]+/)[0],
phone: (text.match(/\d{3}[- ]?\d{3}[- ]?\d{4}/) || [""])[0],
});
}
});


return staff.length ? { staff } : null;
}