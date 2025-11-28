import puppeteer from "puppeteer-core";
import { execSync } from "child_process";
import os from "os";
import path from "path";

/**
 * Try to auto-detect Chrome executable path depending on OS.
 */
function getChromePath() {
  const platform = os.platform();

  if (platform === "win32") {
    // Windows default Chrome path
    const winChrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    return winChrome;
  }

  if (platform === "darwin") {
    // macOS default Chrome path
    return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  }

  if (platform === "linux") {
    // Try to find chromium or google-chrome
    try {
      return execSync("which chromium-browser").toString().trim();
    } catch {
      try {
        return execSync("which chromium-browser").toString().trim();
      } catch {
        return null;
      }
    }
  }

  return null;
}

const chromePath = getChromePath();

export default async function puppeteerParser(url) {
  if (!chromePath) {
    throw new Error("Chrome/Chromium executable not found. Please install Chrome and update puppeteerParser.js with its path.");
  }

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chromePath, // point to system Chrome
  });

  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle2" });

  const content = await page.content();
  await browser.close();

  return content; // send to parsers again
}
