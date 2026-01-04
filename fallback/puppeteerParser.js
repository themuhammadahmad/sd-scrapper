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

import puppeteerManager from '../services/puppeteerManager.js';
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
      const googleChrome = execSync("which chromium-browser").toString().trim();
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
  console.log("📞 Using shared browser for URL:", url);
  return await puppeteerManager.fetchWithPuppeteer(url);
}
// export default async function puppeteerParser(url) {
//   console.log("Starting puppeteerParser for URL:", url);
  
//   if (!chromePath) {
//     console.error("❌ Chrome/Chromium executable not found.");
//     throw new Error("Chrome/Chromium executable not found. Please install Chrome and update puppeteerParser.js with its path.");
//   }

//   let browser;
//   try {
//     console.log("🔧 Launching browser with executablePath:", chromePath);
    
//     browser = await puppeteer.launch({
//       headless: true,
//       executablePath: chromePath,
//       args: [
//         '--no-sandbox',
//         '--disable-setuid-sandbox',
//         '--disable-dev-shm-usage',
//         '--disable-accelerated-2d-canvas',
//         '--no-first-run',
//         '--no-zygote',
//         '--disable-gpu',
//         '--single-process',
//         '--headless=new', // Use new headless mode
//         '--disable-x11-auth', // Disable X11 authentication
//         '--no-xshm', // Disable shared memory
//         '--disable-blink-features=AutomationControlled', // Hide automation
//         '--disable-features=IsolateOrigins,site-per-process', // Performance
//         '--disable-web-security', // Disable CORS
//         '--disable-features=VizDisplayCompositor', // Performance
//         '--window-size=1920,1080', // Set window size
//         '--disable-notifications', // Disable notifications
//         '--disable-popup-blocking', // Allow popups
//         '--disable-background-timer-throttling', // Performance
//         '--disable-backgrounding-occluded-windows', // Performance
//         '--disable-renderer-backgrounding', // Performance
//         '--disable-infobars', // Hide infobars
//         '--disable-breakpad', // Disable crash reporting
//         '--no-default-browser-check', // Skip default browser check
//         '--disable-component-update', // Disable component updates
//         '--disable-domain-reliability', // Disable domain reliability
//         '--disable-features=AudioServiceOutOfProcess', // Performance
//         '--disable-features=TranslateUI' // Disable translation UI
//       ],
//       ignoreHTTPSErrors: true,
//       dumpio: true, // This will show browser console logs
//       defaultViewport: {
//         width: 1920,
//         height: 1080,
//         deviceScaleFactor: 1
//       }
//     });

//     console.log("✅ Browser launched successfully");

//     const page = await browser.newPage();
//     console.log("📄 New page created");

//     // Set a realistic user agent
//     await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
//     // Hide webdriver property
//     await page.evaluateOnNewDocument(() => {
//       Object.defineProperty(navigator, 'webdriver', {
//         get: () => false,
//       });
//     });

//     // Hide chrome property
//     await page.evaluateOnNewDocument(() => {
//       Object.defineProperty(navigator, 'chrome', {
//         get: () => undefined,
//       });
//     });

//     // Add extra headers to look more like a real browser
//     await page.setExtraHTTPHeaders({
//       'Accept-Language': 'en-US,en;q=0.9',
//       'Accept-Encoding': 'gzip, deflate, br',
//       'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
//       'Connection': 'keep-alive',
//       'Upgrade-Insecure-Requests': '1'
//     });

//     // Set cookies if needed (some sites check for cookies)
//     await page.setCookie({
//       name: 'cookie_consent',
//       value: 'true',
//       domain: new URL(url).hostname
//     });

//     console.log("🌐 Navigating to URL with 60 second timeout...");
    
//     try {
//       // Try with longer timeout
//       await page.goto(url, { 
//         waitUntil: ['domcontentloaded', 'networkidle0'],
//         timeout: 60000 // 60 seconds
//       });
//       console.log("✅ Page loaded successfully");
      
//     } catch (navError) {
//       console.log("⚠️ Navigation timeout or error, trying alternative approach...");
      
//       // Try with simpler wait condition
//       try {
//         await page.goto(url, { 
//           waitUntil: 'domcontentloaded',
//           timeout: 30000
//         });
//         console.log("✅ Page loaded with domcontentloaded");
//       } catch (secondError) {
//         console.log("⚠️ Still failing, trying with no wait condition...");
        
//         // Last resort: just go to URL and wait manually
//         await page.goto(url, { timeout: 10000 });
//         await page.waitForTimeout(5000); // Wait 5 seconds for page to load
//         console.log("✅ Page accessed with manual wait");
//       }
//     }

//     // Wait for page to be fully interactive
//     await page.waitForFunction(() => {
//       return document.readyState === 'complete' || 
//              (document.querySelector && document.querySelector('body'));
//     }, { timeout: 10000 });

//     // Try to detect if we're being blocked
//     const pageContent = await page.content();
//     if (pageContent.includes('Access Denied') || 
//         pageContent.includes('Bot detected') || 
//         pageContent.includes('Cloudflare') ||
//         pageContent.length < 1000) {
//       console.log("⚠️ Possible bot detection or blocking detected");
      
//       // Try to bypass by refreshing or waiting
//       await page.waitForTimeout(2000);
//       await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
//     }

//     const content = await page.content();
//     console.log("📝 Content extracted, length:", content.length);

//     // Save screenshot for debugging (optional)
//     // await page.screenshot({ path: 'debug-screenshot.png' });

//     await browser.close();
//     console.log("🔚 Browser closed");

//     return content;

//   } catch (error) {
//     console.error("❌ Puppeteer error occurred:");
//     console.error("Error name:", error.name);
//     console.error("Error message:", error.message);
    
//     // Try to get page content even if navigation failed
//     let fallbackContent = null;
//     if (page) {
//       try {
//         fallbackContent = await page.content();
//         console.log("📝 Got fallback content, length:", fallbackContent?.length || 0);
//       } catch (contentError) {
//         console.error("Could not get fallback content:", contentError.message);
//       }
//     }
    
//     if (browser) {
//       try {
//         await browser.close();
//         console.log("🔚 Browser closed after error");
//       } catch (closeError) {
//         console.error("Error while closing browser:", closeError);
//       }
//     }
    
//     // Return fallback content if available
//     if (fallbackContent && fallbackContent.length > 1000) {
//       console.log("🔄 Returning fallback content despite navigation error");
//       return fallbackContent;
//     }
    
//     throw error;
//   }
// }