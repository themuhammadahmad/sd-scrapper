// services/puppeteerManager.js
import puppeteer from "puppeteer-core";
import { execSync } from "child_process";
import os from "os";

class PuppeteerManager {
  constructor() {
    this.browser = null;
    this.isInitializing = false;
    this.activePages = 0;
    this.maxPages = 3; // Maximum pages allowed at once
    this.memoryCheckInterval = null;
    this.lastMemoryCheck = Date.now();
    this.pageCreationTimes = new Map(); // Track when pages were created
    this.maxPageAge = 300000; // 5 minutes max page age (5 * 60 * 1000)
    this.cleanupInterval = null;
    this.totalMemoryUsed = 0;
    this.maxMemoryMB = 500; // Maximum memory allowed for Puppeteer (MB)
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
    if (this.browser) {
      // Check if browser is still connected
      try {
        await this.browser.version();
        return this.browser;
      } catch (e) {
        console.log("⚠️ Browser disconnected, reinitializing...");
        this.browser = null;
      }
    }
    
    if (this.isInitializing) {
      return this.waitForInitialization();
    }

    this.isInitializing = true;
    console.log("🔄 Initializing shared browser instance...");
    
    try {
      const chromePath = await this.getChromePath();
      
      // CRITICAL: Memory-optimized launch options
      this.browser = await puppeteer.launch({
        headless: 'new',
        executablePath: chromePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',  // Uses /tmp instead of /dev/shm
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--headless=new',
          '--disable-x11-auth',
          '--no-xshm',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-ipc-flooding-protection',
          '--disable-hang-monitor',
          '--disable-features=TranslateUI,BlinkGenPropertyTrees',
          '--disable-software-rasterizer',
          '--disable-background-networking',
          '--disable-default-apps',
          '--disable-extensions',
          '--disable-sync',
          '--metrics-recording-only',
          '--mute-audio',
          '--no-default-browser-check',
          '--no-first-run',
          '--safebrowsing-disable-auto-update',
          '--disable-client-side-phishing-detection',
          '--disable-popup-blocking',
          '--disable-prompt-on-repost',
          '--disable-domain-reliability',
          '--disable-component-update',
          '--disable-features=AudioServiceOutOfProcess',
          '--disable-breakpad',
          '--password-store=basic',
          '--use-mock-keychain',
          '--disable-infobars',
          '--window-size=1280,720',  // Smaller window size
          '--disable-logging',
          '--v=0',
          '--disable-features=VizDisplayCompositor',
          '--disable-threaded-animation',
          '--disable-threaded-scrolling',
          '--disable-checker-imaging',
          '--disable-partial-raster',
          '--disable-skia-runtime-opts',
          '--disable-composited-antialiasing',
          `--js-flags="--max-old-space-size=128"`  // Limit V8 memory
        ],
        ignoreHTTPSErrors: true,
        defaultViewport: {
          width: 1280,
          height: 720,  // Smaller viewport = less memory
          deviceScaleFactor: 1
        },
        protocolTimeout: 60000,
        // MEMORY CRITICAL: Limit resource usage
        ignoreDefaultArgs: ['--enable-automation'],
        dumpio: false,  // Don't log to console (saves memory)
      });

      // Start memory monitoring
      this.startMemoryMonitoring();
      // Start cleanup interval for old pages
      this.startCleanupInterval();

      console.log("✅ Shared browser instance ready");
      console.log("📊 Memory limits: Max 500MB | Max pages: 3");
      
      this.isInitializing = false;
      return this.browser;
    } catch (error) {
      this.isInitializing = false;
      console.error("❌ Failed to initialize browser:", error);
      throw error;
    }
  }

    // Start memory monitoring
  startMemoryMonitoring() {
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
    }
    
    this.memoryCheckInterval = setInterval(async () => {
      try {
        const memoryUsage = process.memoryUsage();
        const usedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
        const totalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
        this.totalMemoryUsed = usedMB;
        
        console.log(`📊 Memory Usage: ${usedMB}MB / ${totalMB}MB | Active Pages: ${this.activePages}`);
        
        // Emergency shutdown if memory is too high
        if (usedMB > this.maxMemoryMB) {
          console.warn(`🚨 HIGH MEMORY USAGE (${usedMB}MB > ${this.maxMemoryMB}MB)! Emergency cleanup...`);
          await this.emergencyCleanup();
        }
        
        // Close browser if idle for too long
        if (this.browser && this.activePages === 0) {
          const idleTime = Date.now() - this.lastMemoryCheck;
          if (idleTime > 300000) { // 5 minutes idle
            console.log("🕐 Browser idle for 5 minutes, closing to save memory...");
            await this.closeBrowser();
          }
        }
        
        this.lastMemoryCheck = Date.now();
      } catch (error) {
        console.error("Error in memory monitoring:", error);
      }
    }, 30000); // Check every 30 seconds
  }

    // Start cleanup interval for old pages
  startCleanupInterval() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldPages();
    }, 60000); // Cleanup every minute
  }

// Cleanup pages that are too old
async cleanupOldPages() {
  if (!this.browser) return;
  
  try {
    const pages = await this.browser.pages();
    const now = Date.now();
    
    // Clean up old entries from our tracking map
    for (const [pageId, createdTime] of this.pageCreationTimes.entries()) {
      if (now - createdTime > this.maxPageAge) {
        console.log(`🧹 Cleaning up old page entry (age: ${Math.round((now - createdTime) / 1000)}s)`);
        this.pageCreationTimes.delete(pageId);
      }
    }
    
    // Also close pages if we have too many (keep only 3)
    if (pages.length > this.maxPages) {
      console.log(`🧹 Closing ${pages.length - this.maxPages} excess pages`);
      for (const page of pages.slice(this.maxPages)) {
        try {
          await page.close();
          this.activePages = Math.max(0, this.activePages - 1);
        } catch (e) {
          // Ignore errors
        }
      }
    }
  } catch (error) {
    console.error("Error in page cleanup:", error);
  }
}


  // Emergency memory cleanup
  async emergencyCleanup() {
    try {
      if (this.browser) {
        const pages = await this.browser.pages();
        for (const page of pages.slice(3)) { // Keep only 3 pages
          await page.close().catch(() => {});
        }
      }
      
      if (global.gc) {
        global.gc(); // Force garbage collection if available
      }
      
      // Clear interval and restart
      if (this.memoryCheckInterval) {
        clearInterval(this.memoryCheckInterval);
        this.memoryCheckInterval = null;
      }
      
      this.startMemoryMonitoring();
      console.log("✅ Emergency cleanup completed");
    } catch (error) {
      console.error("Error in emergency cleanup:", error);
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
  // Wait if too many pages
  while (this.activePages >= this.maxPages) {
    console.log(`⏳ Too many pages (${this.activePages}/${this.maxPages}), waiting...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  this.activePages++;
  let page = null;
  const startTime = Date.now();
  
  try {
    const browser = await this.initializeBrowser();
    
    // Create new page
    page = await browser.newPage();
    
    // Generate a unique ID for this page (FIXED VERSION)
    const pageId = `page_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.pageCreationTimes.set(pageId, Date.now());
    
    // Set memory-efficient settings
    await page.setCacheEnabled(false); // Disable cache
    await page.setRequestInterception(true);
    
    // Block unnecessary resources
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });
    
    // Set basic headers
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log(`🌐 [${this.activePages}/${this.maxPages}] Navigating to: ${url}`);
    
    let content;
    try {
      await page.goto(url, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000,
        referer: 'https://www.google.com/'
      });
      
      // Wait minimal time
    // Wait minimal time (compatible with older Puppeteer versions)
await new Promise(resolve => setTimeout(resolve, 2000));
      
      content = await page.content();
      console.log(`✅ [${Date.now() - startTime}ms] Successfully fetched: ${url}`);
    } catch (navError) {
      console.log(`⚠️ Navigation issue for ${url}: ${navError.message}`);
      throw navError;
    }
    
    return content;
    
  } catch (error) {
    console.error(`❌ Error fetching ${url}:`, error.message);
    throw error;
  } finally {
    // ALWAYS clean up
    if (page) {
      try {
        await page.close();
        this.activePages = Math.max(0, this.activePages - 1);
        
        // Clean up our tracking (find and remove by page reference)
        for (const [id, time] of this.pageCreationTimes.entries()) {
          if (Date.now() - time > 300000) { // Older than 5 minutes
            this.pageCreationTimes.delete(id);
          }
        }
      } catch (closeError) {
        console.error("Error closing page:", closeError);
        this.activePages = Math.max(0, this.activePages - 1);
      }
    }
  }
}

 async closeBrowser() {
    if (this.browser) {
      console.log("🔚 Closing shared browser instance...");
      try {
        // Clear intervals
        if (this.memoryCheckInterval) {
          clearInterval(this.memoryCheckInterval);
          this.memoryCheckInterval = null;
        }
        if (this.cleanupInterval) {
          clearInterval(this.cleanupInterval);
          this.cleanupInterval = null;
        }
        
        // Clear tracking
        this.pageCreationTimes.clear();
        this.activePages = 0;
        
        await this.browser.close();
        this.browser = null;
        console.log("✅ Shared browser instance closed");
      } catch (error) {
        console.error("❌ Error closing browser:", error);
      }
    }
  }


  getStats() {
    const memoryUsage = process.memoryUsage();
    return {
      browserActive: !!this.browser,
      activePages: this.activePages,
      maxPages: this.maxPages,
      memoryUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      memoryTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      maxMemoryMB: this.maxMemoryMB,
      pageCount: this.pageCreationTimes.size
    };
  }

   // Method to manually trigger cleanup
  async forceCleanup() {
    console.log("🧹 Manual cleanup triggered");
    await this.emergencyCleanup();
    if (global.gc) {
      global.gc();
      console.log("🗑️ Forced garbage collection");
    }
  }
}

// Singleton instance
export default new PuppeteerManager();