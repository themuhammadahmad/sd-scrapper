// services/puppeteerManager.js
import puppeteer from "puppeteer-core";
import { execSync } from "child_process";
import os from "os";

class PuppeteerManager {
  constructor() {
    this.browser = null;
    this.isInitializing = false;
    this.queue = [];
    this.activeRequests = 0;
    this.maxConcurrent = 1; // Only 1 browser instance
    this.chromePath = null;
    this.initPromise = null;
  }

  async getChromePath() {
    if (this.chromePath) return this.chromePath;

    const platform = os.platform();
    console.log("Detected platform:", platform);

    if (platform === "win32") {
      this.chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    } else if (platform === "darwin") {
      this.chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    } else if (platform === "linux") {
      try {
        this.chromePath = execSync("which chromium-browser").toString().trim();
      } catch {
        try {
          this.chromePath = execSync("which chromium-browser").toString().trim();
        } catch {
          try {
            this.chromePath = execSync("which chromium").toString().trim();
          } catch {
            const commonPaths = [
              '/usr/bin/chromium-browser',
              '/usr/bin/chromium',
              '/bin/chromium-browser',
              '/bin/chromium'
            ];
            for (const path of commonPaths) {
              try {
                execSync(`test -f ${path}`);
                this.chromePath = path;
                break;
              } catch { /* continue */ }
            }
          }
        }
      }
    }

    if (!this.chromePath) {
      throw new Error("Chrome/Chromium executable not found.");
    }

    console.log("Using Chrome path:", this.chromePath);
    return this.chromePath;
  }

  async initializeBrowser() {
    if (this.browser) return this.browser;
    if (this.isInitializing) {
      return this.waitForInitialization();
    }

    this.isInitializing = true;
    try {
      const chromePath = await this.getChromePath();
      
      console.log("🔧 Launching shared browser instance...");
      this.browser = await puppeteer.launch({
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
          '--headless=new',
          '--disable-x11-auth',
          '--no-xshm',
          '--disable-blink-features=AutomationControlled',
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--window-size=1920,1080',
          '--disable-notifications',
          '--disable-popup-blocking',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-infobars',
          '--disable-breakpad',
          '--no-default-browser-check',
          '--disable-component-update',
          '--disable-domain-reliability',
          '--disable-features=AudioServiceOutOfProcess',
          '--disable-features=TranslateUI',
          '--max-old-space-size=256' // Limit memory usage
        ],
        ignoreHTTPSErrors: true,
        defaultViewport: {
          width: 1920,
          height: 1080,
          deviceScaleFactor: 1
        }
      });

      console.log("✅ Shared browser instance ready");
      this.isInitializing = false;
      return this.browser;
    } catch (error) {
      this.isInitializing = false;
      console.error("❌ Failed to initialize browser:", error);
      throw error;
    }
  }

  async waitForInitialization() {
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        if (!this.isInitializing && this.browser) {
          clearInterval(checkInterval);
          resolve(this.browser);
        }
        if (!this.isInitializing && !this.browser) {
          clearInterval(checkInterval);
          reject(new Error("Browser initialization failed"));
        }
      }, 100);
    });
  }

  async fetchWithPuppeteer(url) {
    this.activeRequests++;
    
    try {
      const browser = await this.initializeBrowser();
      const page = await browser.newPage();
      
      // Set user agent and headers
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      });

      console.log(`🌐 [Shared Browser] Navigating to: ${url}`);
      
      let content;
      try {
        await page.goto(url, { 
          waitUntil: 'domcontentloaded',
          timeout: 60000 
        });
        content = await page.content();
        console.log(`✅ [Shared Browser] Successfully fetched: ${url}`);
      } catch (navError) {
        console.log(`⚠️ [Shared Browser] Navigation issue for ${url}, trying fallback...`);
        try {
          await page.goto(url, { timeout: 10000 });
          await page.waitForTimeout(5000);
          content = await page.content();
        } catch (fallbackError) {
          throw fallbackError;
        }
      }

      await page.close();
      return content;
      
    } finally {
      this.activeRequests--;
    }
  }

  async closeBrowser() {
    if (this.browser) {
      console.log("🔚 Closing shared browser instance...");
      try {
        await this.browser.close();
        this.browser = null;
        console.log("✅ Shared browser instance closed");
      } catch (error) {
        console.error("❌ Error closing browser:", error);
      }
    }
  }

  getStats() {
    return {
      browserActive: !!this.browser,
      activeRequests: this.activeRequests,
      queueLength: this.queue.length,
      isInitializing: this.isInitializing
    };
  }
}

// Singleton instance
export default new PuppeteerManager();