// import puppeteer from "puppeteer-core";
// import { execSync } from "child_process";
// import os from "os";
// import path from "path";

// /**
//  * Try to auto-detect Chrome executable path depending on OS.
//  */
// function getChromePath() {
//   const platform = os.platform();

//   if (platform === "win32") {
//     // Windows default Chrome path
//     const winChrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
//     return winChrome;
//   }

//   if (platform === "darwin") {
//     // macOS default Chrome path
//     return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
//   }

//   if (platform === "linux") {
//     // Try to find chromium or google-chrome
//     try {
//       return execSync("which chromium-browser").toString().trim();
//     } catch {
//       try {
//         return execSync("which chromium-browser").toString().trim();
//       } catch {
//         return null;
//       }
//     }
//   }

//   return null;
// }

// const chromePath = getChromePath();

// export default async function puppeteerParser(url) {
//   if (!chromePath) {
//     throw new Error("Chrome/Chromium executable not found. Please install Chrome and update puppeteerParser.js with its path.");
//   }

//   const browser = await puppeteer.launch({
//     headless: true,
//     executablePath: chromePath, // point to system Chrome
//   });

//   const page = await browser.newPage();
//   await page.goto(url, { waitUntil: "networkidle2" });

//   const content = await page.content();
//   await browser.close();

//   return content; // send to parsers again
// }

import puppeteer from "puppeteer-core";
import { execSync } from "child_process";
import os from "os";
import path from "path";

/**
 * Try to auto-detect Chrome executable path depending on OS.
 */
function getChromePath() {
  const platform = os.platform();
  console.log("Detected platform:", platform);

  if (platform === "win32") {
    const winChrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    console.log("Windows Chrome path:", winChrome);
    return winChrome;
  }

  if (platform === "darwin") {
    const macChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    console.log("macOS Chrome path:", macChrome);
    return macChrome;
  }

  if (platform === "linux") {
    try {
      const googleChrome = execSync("which google-chrome").toString().trim();
      console.log("Found google-chrome at:", googleChrome);
      return googleChrome;
    } catch (error) {
      console.log("google-chrome not found, trying chromium-browser...");
      try {
        const chromiumBrowser = execSync("which chromium-browser").toString().trim();
        console.log("Found chromium-browser at:", chromiumBrowser);
        return chromiumBrowser;
      } catch (error2) {
        console.log("chromium-browser not found, trying chromium...");
        try {
          const chromium = execSync("which chromium").toString().trim();
          console.log("Found chromium at:", chromium);
          return chromium;
        } catch (error3) {
          console.log("No chromium found via which command");
          // Fallback to common paths
          const commonPaths = [
            '/usr/bin/chromium-browser',
            '/usr/bin/chromium',
            '/bin/chromium-browser',
            '/bin/chromium'
          ];
          for (const path of commonPaths) {
            try {
              execSync(`test -f ${path}`);
              console.log("Found chromium at common path:", path);
              return path;
            } catch (e) {
              // Continue to next path
            }
          }
          return null;
        }
      }
    }
  }

  return null;
}

const chromePath = getChromePath();
console.log("Final chromePath:", chromePath);

export default async function puppeteerParser(url) {
  console.log("Starting puppeteerParser for URL:", url);
  
  if (!chromePath) {
    console.error("❌ Chrome/Chromium executable not found.");
    throw new Error("Chrome/Chromium executable not found. Please install Chrome and update puppeteerParser.js with its path.");
  }

  let browser;
  try {
    console.log("🔧 Launching browser with executablePath:", chromePath);
    
    browser = await puppeteer.launch({
      headless: true,
      executablePath: chromePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--single-process',
        '--headless=new', // Use new headless mode
        '--disable-x11-auth', // Disable X11 authentication
        '--no-xshm' // Disable shared memory
      ],
      ignoreHTTPSErrors: true,
      dumpio: true // This will show browser console logs
    });

    console.log("✅ Browser launched successfully");

    const page = await browser.newPage();
    console.log("📄 New page created");

    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    await page.goto(url, { 
      waitUntil: "networkidle2",
      timeout: 30000 
    });
    console.log("🌐 Page loaded:", url);

    const content = await page.content();
    console.log("📝 Content extracted, length:", content.length);

    await browser.close();
    console.log("🔚 Browser closed");

    return content;

  } catch (error) {
    console.error("❌ Puppeteer error occurred:");
    console.error("Error name:", error.name);
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    
    // Additional debugging for common issues
    if (error.message.includes('executable doesn\'t exist')) {
      console.error("🔍 The Chromium executable doesn't exist at the specified path");
      console.error("Please verify Chromium is installed at:", chromePath);
    }
    
    if (error.message.includes('No usable sandbox')) {
      console.error("🔍 Sandbox issue detected - common in VPS environments");
    }
    
    if (error.message.includes('X server') || error.message.includes('DISPLAY')) {
      console.error("🔍 X11/Display issue detected - adding more headless flags");
    }
    
    if (browser) {
      try {
        await browser.close();
        console.log("🔚 Browser closed after error");
      } catch (closeError) {
        console.error("Error while closing browser:", closeError);
      }
    }
    
    throw error;
  }
}