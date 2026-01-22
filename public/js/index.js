let scrapingStatusInterval = null;

async function scrapSingleSite(siteId, siteUrl, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }

    const button = event?.target;
    const originalText = button?.textContent;
    
    if (button) {
        button.disabled = true;
        button.textContent = '⏳ Scraping...';
        button.classList.add('loading');
    }

    const status = document.getElementById('status');
    status.innerHTML = `🔄 Scraping ${siteUrl}...`;

    try {
        const response = await fetch(`/scrape-site/${siteId}`, {
            method: 'POST'
        });

        const result = await response.json();
        
        if (result.success) {
            status.innerHTML = `✅ Successfully scraped ${siteUrl} (${result.staffCount} staff members found)`;
            
            // Optional: Automatically refresh the site data after scraping
            setTimeout(() => {
                // Find the site element and trigger a click to refresh its data
                const siteElements = document.querySelectorAll('.site-item');
                siteElements.forEach(element => {
                    if (element.textContent.includes(siteUrl)) {
                        element.click();
                    }
                });
            }, 1500);
            
        } else {
            status.innerHTML = `❌ Failed to scrape ${siteUrl}: ${result.error}`;
        }

    } catch (error) {
        status.innerHTML = `❌ Error scraping ${siteUrl}: ${error.message}`;
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = originalText || '🔄 Scrap Now';
            button.classList.remove('loading');
        }
    }
}

async function triggerScraping() {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const status = document.getElementById('status');

    startBtn.disabled = true;
    startBtn.textContent = '⏳ Starting...';
    stopBtn.disabled = false;
    status.innerHTML = '🔄 Starting scraping process...';

    try {
        const response = await fetch('/scrape-now', {
            method: 'POST'
        });

        const result = await response.json();
        status.innerHTML = `✅ ${result.message}`;
        
        // Start polling for status updates
        startStatusPolling();
        
    } catch (error) {
        status.innerHTML = `❌ Error: ${error.message}`;
        resetScrapingButtons();
    }
}

async function stopScraping() {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const status = document.getElementById('status');

    stopBtn.disabled = true;
    stopBtn.textContent = '⏹️ Stopping...';
    status.innerHTML = '🛑 Stopping scraping process... Please wait.';

    try {
        const response = await fetch('/stop-scraping', {
            method: 'POST'
        });

        const result = await response.json();
        
        if (result.success) {
            status.innerHTML = `✅ ${result.message}`;
            
            // Poll until scraping is fully stopped
            await waitForScrapingToStop();
            
            // Stop status polling
            stopStatusPolling();
            
            // Reset buttons
            resetScrapingButtons();
            
        } else {
            status.innerHTML = `⚠️ ${result.message}`;
            resetScrapingButtons();
        }
        
    } catch (error) {
        status.innerHTML = `❌ Error stopping: ${error.message}`;
        resetScrapingButtons();
    }
}

// Helper function to wait until scraping is fully stopped
async function waitForScrapingToStop() {
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds max
    
    while (attempts < maxAttempts) {
        try {
            const response = await fetch('/api/scrape-status');
            const status = await response.json();
            
            if (!status.isRunning) {
                // console.log('✅ Scraping fully stopped');
                return;
            }
            
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
            
        } catch (error) {
            console.error('Error checking status:', error);
            break;
        }
    }
    
    // console.log('⚠️ Timeout waiting for scraping to stop');
}

function startStatusPolling() {
    // Clear existing interval
    stopStatusPolling();
    
    // Poll every 3 seconds
    scrapingStatusInterval = setInterval(async () => {
        try {
            const response = await fetch('/api/scrape-status');
            const status = await response.json();
            
            updateScrapingStatus(status);
            
            // If scraping stopped, stop polling
            if (!status.isRunning) {
                stopStatusPolling();
                resetScrapingButtons();
            }
        } catch (error) {
            console.error('Error polling status:', error);
        }
    }, 3000);
}

function stopStatusPolling() {
    if (scrapingStatusInterval) {
        clearInterval(scrapingStatusInterval);
        scrapingStatusInterval = null;
    }
}

function updateScrapingStatus(status) {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const statusElement = document.getElementById('status');

    if (status.isRunning) {
        startBtn.disabled = true;
        startBtn.textContent = '⏳ Scraping...';
        stopBtn.disabled = false;
        statusElement.innerHTML = '🔄 Scraping in progress... (Auto-refreshing every 3s)';
        
        if (status.shouldStop) {
            statusElement.innerHTML = '🛑 Stopping scraping... Please wait.';
        }
    } else {
        resetScrapingButtons();
        statusElement.innerHTML = '✅ Scraping stopped or completed.';
    }
}

function resetScrapingButtons() {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    
    startBtn.disabled = false;
    startBtn.textContent = '🚀 Start Scraping Now';
    stopBtn.disabled = true;
    stopBtn.textContent = '⏹️ Stop Scraping';
    
    stopStatusPolling();
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Check initial status
    checkInitialStatus();
});

async function checkInitialStatus() {
    try {
        const response = await fetch('/api/scrape-status');
        const status = await response.json();
        
        if (status.isRunning) {
            // If scraping is already running, enable stop button and start polling
            document.getElementById('startBtn').disabled = true;
            document.getElementById('startBtn').textContent = '⏳ Scraping...';
            document.getElementById('stopBtn').disabled = false;
            startStatusPolling();
            
            // Update status message
            if (status.shouldStop) {
                document.getElementById('status').innerHTML = '🛑 Scraping is stopping...';
            } else {
                document.getElementById('status').innerHTML = '🔄 Scraping in progress...';
            }
        }
    } catch (error) {
        console.error('Error checking initial status:', error);
    }
}
    let currentPage = 1;
const sitesPerPage = 20;
let currentSearch = '';

function handleSearchKeypress(event) {
    if (event.key === 'Enter') {
        event.preventDefault(); // Prevent form submission
        event.stopPropagation(); // Prevent event bubbling
        performSearch();
    }
}
// Update performSearch function
function performSearch(event) {
    if (event) {
        event.stopPropagation(); // Prevent event bubbling
        event.preventDefault(); // Prevent form submission
    }
    
    const searchInput = document.getElementById('siteSearch');
    currentSearch = searchInput.value.trim();
    currentPage = 1; // Reset to first page when searching
    fetchSites(currentPage, currentSearch);
}
// Update clearSearch function  
function clearSearch(event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    
    const searchInput = document.getElementById('siteSearch');
    searchInput.value = '';
    currentSearch = '';
    currentPage = 1;
    fetchSites(currentPage, '');
}

// Update handleSearchKeypress
function handleSearchKeypress(event) {
    if (event.key === 'Enter') {
        event.preventDefault(); // Prevent form submission
        event.stopPropagation(); // Prevent event bubbling
        performSearch();
    }
}

async function fetchSites(page = 1, search = '') {
  const status = document.getElementById('status');
  const sitesList = document.getElementById('sitesList');
  const failedList = document.getElementById('failedList');
  
  status.innerHTML = '📡 Fetching sites...';
    sitesList.innerHTML = '';
    failedList.innerHTML = '';
    
    try {
      // Build URL with search parameter
      const url = `/sites?page=${page}&limit=${sitesPerPage}${search ? `&search=${encodeURIComponent(search)}` : ''}`;
      
      const response = await fetch(url);
        const result = await response.json();
        
        if (result.sites && result.sites.length > 0) {
            // Create sites container with header
            const sitesContainer = document.createElement('div');
            sitesContainer.className = 'sites-container';
            
            // Build header based on search
            const headerText = result.search ? 
                `🔍 Search Results for "${result.search}"` : 
                '✅ Available Sites';
            
            sitesContainer.innerHTML = `
                <div class="table-header">
                    ${headerText} (${result.pagination.totalSites} total)
                </div>
                ${result.search ? `
                    <div class="search-info">
                        Found ${result.pagination.totalSites} sites matching "${result.search}"
                        <button class="btn btn-secondary" onclick="clearSearch()" style="margin-left: 10px; padding: 4px 8px; font-size: 12px;">
                            Clear Search
                        </button>
                    </div>
                ` : ''}
                <div class="stats">
                    Showing ${result.sites.length} sites - Page ${result.pagination.currentPage} of ${result.pagination.totalPages}
                </div>
            `;

            // Create sites list
            const sitesWrapper = document.createElement('div');
            result.sites.forEach(site => {
                const siteDiv = document.createElement('div');
                siteDiv.className = 'site-item';
                
                // Highlight search term in results
                const highlightedUrl = result.search ? highlightText(site.baseUrl, result.search) : site.baseUrl;
                const highlightedDir = result.search ? highlightText(site.staffDirectory, result.search) : site.staffDirectory;
                
// In the fetchSites function, update the siteDiv.innerHTML:
siteDiv.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center;">
        <strong style="flex: 1;">${highlightedUrl}</strong>
        <div style="display: flex; gap: 10px; align-items: center;">
            <button class="btn-scrap-site btn-small btn-primary" 
                    onclick="scrapSingleSite('${site._id}', '${site.baseUrl}', event)">
                🔄 Scrap Now
            </button>
            <span style="font-size: 12px; color: #666;">
                Last scraped: ${site.lastScrapedAt ? new Date(site.lastScrapedAt).toLocaleString() : 'Never'}
            </span>
        </div>
    </div>
    <div style="margin-top: 8px; font-size: 13px; color: #555;">
        Directory: ${highlightedDir}
    </div>
`;
               // In the fetchSites function, update the onclick handler:
siteDiv.onclick = (event) => fetchSiteSnapshot(site._id, site.baseUrl, event.currentTarget);
                sitesWrapper.appendChild(siteDiv);
            });

            sitesContainer.appendChild(sitesWrapper);
            
            // Add pagination controls
            const paginationDiv = createPaginationControls(result.pagination, result.search);
            sitesContainer.appendChild(paginationDiv);
            
            sitesList.appendChild(sitesContainer);
            
            const statusText = result.search ? 
                `✅ Found ${result.pagination.totalSites} sites matching "${result.search}"` :
                `✅ Found ${result.pagination.totalSites} sites total`;
            status.innerHTML = statusText;
            
            currentPage = page;
            currentSearch = search;
        } else {
            const noResultsHtml = result.search ? 
                `<p>No sites found matching "${result.search}"</p>
                 <button class="btn btn-secondary" onclick="clearSearch()">Show All Sites</button>` :
                '<p>No sites found in database.</p>';
                
            sitesList.innerHTML = `
                <div class="sites-container">
                    <div class="table-header">
                        ${result.search ? '🔍 Search Results' : 'Available Sites'}
                    </div>
                    ${noResultsHtml}
                </div>
            `;
            status.innerHTML = result.search ? 
                `❌ No sites found for "${result.search}"` : 
                'ℹ️ No sites available';
        }
    } catch (error) {
        status.innerHTML = `❌ Error fetching sites: ${error.message}`;
    }
}

// Update pagination function to preserve search
function createPaginationControls(pagination, search = '') {
    const paginationDiv = document.createElement('div');
    paginationDiv.style.cssText = `
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 10px;
        margin-top: 20px;
        padding: 15px;
        background: rgba(255,255,255,0.5);
        border-radius: 8px;
        flex-wrap: wrap;
    `;

    // Previous button
    if (pagination.hasPrev) {
        const prevBtn = document.createElement('button');
        prevBtn.className = 'btn btn-secondary';
        prevBtn.innerHTML = '⬅ Previous';
        prevBtn.onclick = () => fetchSites(pagination.currentPage - 1, search);
        paginationDiv.appendChild(prevBtn);
    }

    // Page info
    const pageInfo = document.createElement('span');
    pageInfo.style.cssText = 'font-weight: bold; color: #666; margin: 0 10px;';
    pageInfo.textContent = `Page ${pagination.currentPage} of ${pagination.totalPages}`;
    paginationDiv.appendChild(pageInfo);

    // Next button
    if (pagination.hasNext) {
        const nextBtn = document.createElement('button');
        nextBtn.className = 'btn btn-secondary';
        nextBtn.innerHTML = 'Next ➡';
        nextBtn.onclick = () => fetchSites(pagination.currentPage + 1, search);
        paginationDiv.appendChild(nextBtn);
    }

    // Page number buttons (show limited set)
    if (pagination.totalPages > 1) {
        const pageButtons = document.createElement('div');
        pageButtons.style.cssText = 'display: flex; gap: 5px; margin-left: 10px; flex-wrap: wrap; justify-content: center;';
        
        const startPage = Math.max(1, pagination.currentPage - 2);
        const endPage = Math.min(pagination.totalPages, pagination.currentPage + 2);
        
        for (let i = startPage; i <= endPage; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.className = i === pagination.currentPage ? 'btn btn-primary' : 'btn btn-secondary';
            pageBtn.style.padding = '5px 10px';
            pageBtn.style.fontSize = '12px';
            pageBtn.textContent = i;
            pageBtn.onclick = () => fetchSites(i, search);
            pageButtons.appendChild(pageBtn);
        }
        
        paginationDiv.appendChild(pageButtons);
    }

    return paginationDiv;
}

// Helper function to highlight search terms
function highlightText(text, searchTerm) {
    if (!searchTerm) return text;
    
    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark class="search-highlight">$1</mark>');
}
   

async function clearFailedDirectories() {
      const status = document.getElementById('status');

      if (!confirm('Are you sure you want to clear all failed directories? This cannot be undone.')) {
        return;
      }

      status.innerHTML = '🗑️ Clearing failed directories...';

      try {
        const response = await fetch('/failed-directories', {
          method: 'DELETE'
        });

        const result = await response.json();
        status.innerHTML = `✅ ${result.message} (${result.deletedCount} deleted)`;

        // Refresh the failed list (which will now be empty)
        fetchFailedDirectories();
      } catch (error) {
        status.innerHTML = `❌ Error clearing failed directories: ${error.message}`;
      }
    }

async function fetchSiteSnapshot(siteId, siteName, element) {
    const status = document.getElementById('status');
    const snapshotData = document.getElementById('snapshotData');
    const changeHistory = document.getElementById('changeHistory');

    // Remove loading state from previously clicked items
    document.querySelectorAll('.site-item.loading').forEach(item => {
        item.classList.remove('loading');
    });

    // Add loading state to clicked item
    if (element) {
        element.classList.add('loading');
    }

    status.innerHTML = `<div class="loading-text"><div class="loading-indicator"></div>Fetching data for ${siteName}...</div>`;
    snapshotData.innerHTML = '';
    changeHistory.innerHTML = '';

    try {
        // Fetch both snapshot and changes in parallel
        const [snapshotResponse, changesResponse] = await Promise.all([
            fetch(`/site/${siteId}/snapshot`),
            fetch(`/site/${siteId}/changes`)
        ]);

        const snapshotResult = await snapshotResponse.json();
    
        const changesResult = await changesResponse.json();

        // Remove loading state
        if (element) {
            element.classList.remove('loading');
        }

        // Display the data
        displaySnapshotData(snapshotResult, siteName);
        displayChangeHistory(changesResult, siteName);

        status.innerHTML = `✅ Data loaded for ${siteName}`;

    } catch (error) {
        // Remove loading state on error too
        if (element) {
            element.classList.remove('loading');
        }
        status.innerHTML = `❌ Error fetching data: ${error.message}`;
    }
}

    function displaySnapshotData(result, siteName) {
      const snapshotData = document.getElementById('snapshotData');
      const status = document.getElementById('status');

      if (result.snapshot && result.snapshot.categories) {
        let html = `
                     <div class="snapshot-container">
                    <div style="background-color: #f0f8ff; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                        <h2>📊 Staff Directory: ${siteName}</h2>
                        <div class="stats">
                            <strong>Snapshot Date:</strong> ${new Date(result.snapshot.snapshotDate).toLocaleString()} | 
                            <strong>Total Staff:</strong> ${result.snapshot.totalCount} | 
                            <strong>Categories:</strong> ${result.snapshot.categories.length}
                        </div>
                    </div>
                `;

        // Process each category
        result.snapshot.categories.forEach(category => {
          html += `
                        <div class="category-section">
                            <div class="category-header">
                                📁 ${category.name} (${category.count} staff)
                            </div>
                    `;

          if (category.members && category.members.length > 0) {
            html += `
                            <table>
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Title</th>
                                        <th>Email</th>
                                        <th>Phone</th>
                                   
                                    </tr>
                                </thead>
                                <tbody>
                        `;

            category.members.forEach(member => {
              html += `
                                <tr>
                                    <td><strong>${member.name || 'N/A'}</strong></td>
                                    <td>${member.title || 'N/A'}</td>
                                    <td>${member.emails && member.emails.length > 0 ? member.emails.join(', ') : 'N/A'}</td>
                                    <td>${member.phones && member.phones.length > 0 ? member.phones.join(', ') : 'N/A'}</td>
                                  
                                </tr>
                            `;
            });

            html += `</tbody></table>`;
          } else {
            html += `<div class="no-data">No staff members in this category</div>`;
          }

          html += `</div></div>`; // Close category-section
        });

        snapshotData.innerHTML = html;
        status.innerHTML = `✅ Snapshot data loaded for ${siteName}`;
      } else {
        snapshotData.innerHTML = `<p>No snapshot data available for ${siteName}</p>`;
        status.innerHTML = `ℹ️ No snapshot data found`;
      }
    }

    function displayChangeHistory(result, siteName) {
      const changeHistory = document.getElementById('changeHistory');

      if (result.changes && result.changes.length > 0) {
        let html = `
                    <div class="changes-section">
                        <div class="changes-header">
                            📊 Change History: ${siteName}
                        </div>
                        <div style="margin-bottom: 15px; font-size: 14px;">
                            Showing last ${result.changes.length} changes
                        </div>
                `;

        result.changes.forEach(change => {
          html += `
                        <div class="change-item">
                            <div class="change-meta">
                                <span>🕒 ${new Date(change.date).toLocaleString()}</span>
                                <span>From: ${new Date(change.fromSnapshot).toLocaleDateString()} → To: ${new Date(change.toSnapshot).toLocaleDateString()}</span>
                            </div>
                            
                            <div class="change-stats">
                                <span class="change-stat stat-added">➕ ${change.addedCount} Added</span>
                                <span class="change-stat stat-removed">➖ ${change.removedCount} Removed</span>
                                <span class="change-stat stat-updated">✏️ ${change.updatedCount} Updated</span>
                            </div>
                    `;

          // Show added staff
          if (change.details.added && change.details.added.length > 0) {
            html += `
                            <div class="change-details">
                                <strong>New Staff Added:</strong>
                                <table class="change-table">
                                    <thead>
                                        <tr>
                                            <th>Name</th>
                                            <th>Title</th>
                                            <th>Category</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                        `;
            change.details.added.forEach(staff => {
              html += `
                                <tr>
                                    <td><strong>${staff.name || 'N/A'}</strong></td>
                                    <td>${staff.title || 'N/A'}</td>
                                    <td>${staff.category || 'N/A'}</td>
                                </tr>
                            `;
            });
            html += `</tbody></table>`;
          }

          // Show removed staff
          if (change.details.removed && change.details.removed.length > 0) {
            html += `
                            <div class="change-details">
                                <strong>Staff Removed:</strong>
                                <table class="change-table">
                                    <thead>
                                        <tr>
                                            <th>Name</th>
                                            <th>Title</th>
                                            <th>Category</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                        `;
            change.details.removed.forEach(staff => {
              html += `
                                <tr>
                                    <td><strong>${staff.name || 'N/A'}</strong></td>
                                    <td>${staff.title || 'N/A'}</td>
                                    <td>${staff.category || 'N/A'}</td>
                                </tr>
                            `;
            });
            html += `</tbody></table>`;
          }

          // Show updated staff
          if (change.details.updated && change.details.updated.length > 0) {
            html += `
                            <div class="change-details">
                                <strong>Staff Updated:</strong>
                        `;
            change.details.updated.forEach(update => {
              html += `
                                <table class="change-table" style="margin: 10px 0;">
                                    <thead>
                                        <tr>
                                            <th>Field</th>
                                            <th>Before</th>
                                            <th>After</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                            `;
              Object.entries(update.diffs || {}).forEach(([field, diff]) => {
                html += `
                                    <tr>
                                        <td><strong>${field}</strong></td>
                                        <td><span class="diff-highlight">${diff.before || 'N/A'}</span></td>
                                        <td><span class="diff-highlight">${diff.after || 'N/A'}</span></td>
                                    </tr>
                                `;
              });
              html += `</tbody></table>`;
            });
            html += `</div>`;
          }

          html += `</div>`; // Close change-item
        });

        html += `</div>`; // Close changes-section
        changeHistory.innerHTML = html;
      } else {
        changeHistory.innerHTML = `
                    <div class="changes-section">
                        <div class="changes-header">
                            📊 Change History: ${siteName}
                        </div>
                        <p>No changes recorded for this site.</p>
                    </div>
                `;
      }
    }

// Function to scrap a failed site
async function scrapFailedSite(failedId, baseUrl, staffDirectory, event) { 
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }

    const button = event?.target;
    const originalText = button?.textContent;
    
    if (button) {
        button.disabled = true;
        button.textContent = '⏳ Retrying...';
        button.classList.add('loading');
    }

    const status = document.getElementById('status');
    status.innerHTML = `🔄 Retrying failed site: ${baseUrl}...`;

    try {
        // First, remove from failed list
        const removeResponse = await fetch(`/failed-directories/${failedId}`, {
            method: 'DELETE'
        });

        if (!removeResponse.ok) {
            throw new Error('Failed to remove from failed list');
        }

        // Now try to scrape the site
        const response = await fetch('/scrape-failed-site', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                baseUrl: baseUrl,
                staffDirectory: staffDirectory
            })
        });

        const result = await response.json();
        
        if (result.success) {
            status.innerHTML = `✅ Successfully retried ${baseUrl} (${result.staffCount} staff members found)`;
            
            // Update the failed list after a short delay
            setTimeout(() => {
                fetchFailedDirectories();
            }, 1500);
            
        } else {
            status.innerHTML = `❌ Failed to scrape ${baseUrl}: ${result.error}`;
            
            // Refresh failed list to show updated attempt count
            setTimeout(() => {
                fetchFailedDirectories();
            }, 1500);
        }

    } catch (error) {
        status.innerHTML = `❌ Error scraping failed site: ${error.message}`;
        
        // Refresh failed list
        setTimeout(() => {
            fetchFailedDirectories();
        }, 1500);
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = originalText || '🔄 Retry';
            button.classList.remove('loading');
        }
    }
}

// Function to remove a failed site without retrying
async function removeFailedSite(failedId, baseUrl, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }

    if (!confirm(`Are you sure you want to remove "${baseUrl}" from failed directories?`)) {
        return;
    }

    const button = event?.target;
    if (button) {
        button.disabled = true;
        button.textContent = '⏳ Removing...';
        button.classList.add('loading');
    }

    const status = document.getElementById('status');
    status.innerHTML = `🗑️ Removing ${baseUrl} from failed list...`;

    try {
        const response = await fetch(`/failed-directories/${failedId}`, {
            method: 'DELETE'
        });

        const result = await response.json();
        
        if (result.success) {
            status.innerHTML = `✅ Removed ${baseUrl} from failed list`;
            
            // Refresh the failed list
            setTimeout(() => {
                fetchFailedDirectories();
            }, 1000);
        } else {
            status.innerHTML = `❌ Error removing: ${result.error}`;
        }

    } catch (error) {
        status.innerHTML = `❌ Error: ${error.message}`;
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = '❌ Remove';
            button.classList.remove('loading');
        }
    }
}

// Alternative: Use the same scrapSingleSite function but for failed sites
async function scrapFailedSiteAlternative(baseUrl, staffDirectory, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }

    const button = event?.target;
    const originalText = button?.textContent;
    
    if (button) {
        button.disabled = true;
        button.textContent = '⏳ Retrying...';
        button.classList.add('loading');
    }

    const status = document.getElementById('status');
    status.innerHTML = `🔄 Retrying failed site: ${baseUrl}...`;

    try {
        // Try to find the site ID first
        const siteResponse = await fetch(`/site-by-url?url=${encodeURIComponent(baseUrl)}`);
        const siteResult = await siteResponse.json();
        
        if (siteResult.site) {
            // Use the existing scrapSingleSite function
            await scrapSingleSite(siteResult.site._id, baseUrl, event);
            
            // Remove from failed list if successful
            setTimeout(() => {
                fetchFailedDirectories();
            }, 2000);
        } else {
            // If site doesn't exist, create it and try scraping
            const response = await fetch('/scrape-directory', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    baseUrl: baseUrl,
                    staffDirectory: staffDirectory
                })
            });

            const result = await response.json();
            
            if (result.success) {
                status.innerHTML = `✅ Successfully retried ${baseUrl}`;
                
                // Remove from failed list
                setTimeout(() => {
                    fetchFailedDirectories();
                }, 1500);
            } else {
                status.innerHTML = `❌ Failed: ${result.error}`;
            }
        }

    } catch (error) {
        status.innerHTML = `❌ Error: ${error.message}`;
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = originalText || '🔄 Retry';
            button.classList.remove('loading');
        }
    }
}

// Add this function to trigger bulk scraping of failed directories
async function scrapeAllFailedDirectories() {
    const button = document.getElementById('scrapeAllFailedBtn');
    const status = document.getElementById('status');
    const originalText = button?.textContent;
    
    if (button) {
        button.disabled = true;
        button.textContent = '⏳ Starting...';
        button.classList.add('loading');
    }
    
    status.innerHTML = `
        <div class="loading-text">
            <div class="loading-indicator"></div>
            Starting bulk scrape of all failed directories...
        </div>
    `;
    
    try {
        const response = await fetch('/scrape-all-failed', {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            status.innerHTML = `
                <div style="padding: 15px; background: #f0f8ff; border-radius: 8px; margin: 10px 0;">
                    <strong>🚀 Bulk Failed Directory Scrape Started!</strong><br>
                    <small>Processing ${result.total} failed directories...</small><br>
                    <small>Using existing scheduler infrastructure with delays between requests.</small>
                    <div id="failedBulkProgress" style="margin-top: 10px;">
                        <div class="progress-container">
                            <div class="progress-bar" style="width: 0%"></div>
                        </div>
                        <div class="progress-text">Starting...</div>
                    </div>
                </div>
            `;
            
            // Start polling for progress updates
            startFailedBulkPolling();
            
        } else {
            status.innerHTML = `
                <div style="padding: 15px; background: #ffebee; border-radius: 8px; margin: 10px 0;">
                    <strong>❌ Failed to start bulk scrape:</strong><br>
                    <small>${result.error || 'Unknown error'}</small>
                </div>
            `;
            resetBulkScrapeButton(button, originalText);
        }
        
    } catch (error) {
        status.innerHTML = `❌ Error: ${error.message}`;
        resetBulkScrapeButton(button, originalText);
    }
}

// Poll for failed directory scraping progress
function startFailedBulkPolling() {
    let pollInterval;
    let lastProgress = 0;
    
    const pollFunction = async () => {
        try {
            const response = await fetch('/scrape-all-failed/status');
            const status = await response.json();
            
            const progressElement = document.getElementById('failedBulkProgress');
            const progressBar = progressElement?.querySelector('.progress-bar');
            const progressText = progressElement?.querySelector('.progress-text');
            
            if (progressElement && status.failedDirStatus?.failedDirProgress) {
                const progress = status.failedDirStatus.failedDirProgress;
                
                // Update progress bar
                if (progressBar) {
                    progressBar.style.width = `${progress.percentage}%`;
                }
                
                // Update text
                if (progressText) {
                    progressText.textContent = 
                        `Processing: ${progress.current}/${progress.total} (${progress.percentage}%)`;
                }
                
                lastProgress = progress.percentage;
                
                // Check if completed
                if (!status.isRunning && lastProgress > 0) {
                    clearInterval(pollInterval);
                    
                    // Refresh failed list
                    setTimeout(() => {
                        fetchFailedDirectories();
                        resetBulkScrapeButton(
                            document.getElementById('scrapeAllFailedBtn'), 
                            '🔄 Scrape All Failed'
                        );
                        
                        // Show completion message
                        const statusEl = document.getElementById('status');
                        statusEl.innerHTML = `
                            <div style="padding: 15px; background: #e8f5e9; border-radius: 8px; margin: 10px 0;">
                                <strong>✅ Bulk Failed Directory Scrape Complete!</strong><br>
                                <small>Processed ${progress.total} directories.</small><br>
                                <small>Failed list has been refreshed.</small>
                            </div>
                        `;
                    }, 1000);
                }
            }
            
            // If not processing failed directories anymore, stop polling
            if (!status.failedDirStatus?.isProcessingFailed && !status.isRunning) {
                clearInterval(pollInterval);
                resetBulkScrapeButton(
                    document.getElementById('scrapeAllFailedBtn'), 
                    '🔄 Scrape All Failed'
                );
            }
            
        } catch (error) {
            console.error('Error polling failed bulk status:', error);
            clearInterval(pollInterval);
        }
    };
    
    // Start polling every 3 seconds
    pollInterval = setInterval(pollFunction, 3000);
    pollFunction(); // Initial call
}

function resetBulkScrapeButton(button, originalText) {
    if (button) {
        button.disabled = false;
        button.textContent = originalText || '🔄 Scrape All Failed';
        button.classList.remove('loading');
    }
}

async function fetchFailedDirectories() {
    const status = document.getElementById('status');
    const failedList = document.getElementById('failedList');
    const sitesList = document.getElementById('sitesList');
    
    status.innerHTML = '📡 Fetching failed directories...';
    failedList.innerHTML = '';
    sitesList.innerHTML = '';
    
    try {
        const response = await fetch('/failed-directories');
        const result = await response.json();
        
        if (result.failedDirectories && result.failedDirectories.length > 0) {
            // Create the container first
            const container = document.createElement('div');
            container.className = 'failed-container';
            
            // Add the header with bulk button
            container.innerHTML = `
                <div class="table-header" style="display: flex; justify-content: space-between; align-items: center; padding: 15px; background: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                    <div style="font-weight: bold; font-size: 16px;">
                        ❌ Failed Directories (${result.count})
                    </div>
                    <div>
                        <button id="scrapeAllFailedBtn" class="btn-bulk-scrape btn-primary" onclick="scrapeAllFailedDirectories()">
                            🔄 Scrape All Failed (${result.count})
                        </button>
                    </div>
                </div>
                
                <div class="bulk-info" style="padding: 12px; background: #e3f2fd; margin: 10px 15px; border-radius: 6px; border-left: 4px solid #2196f3;">
                    <strong>💡 Bulk Retry:</strong> Click the button above to automatically retry all ${result.count} failed directories.
                    This uses the same scheduler system with proper delays between requests.
                </div>
                
                <div class="failed-stats" style="padding: 8px 15px; background: #f5f5f5; margin-bottom: 10px; font-size: 14px;">
                    <strong>📊 Stats:</strong> ${result.count} failed directories | 
                    <strong>Last updated:</strong> ${new Date().toLocaleTimeString()}
                </div>
                
                <div id="failedDirectoriesList" style="padding: 0 15px 15px 15px;">
                    <!-- Individual failed directories will be inserted here -->
                </div>
            `;
            
            // Now add individual failed directories
            const failedDirectoriesList = container.querySelector('#failedDirectoriesList');
            
            result.failedDirectories.forEach(failed => {
                const failureBadgeClass = `failure-${failed.failureType.replace('_', '-')}`;
                const failureLabel = failed.failureType === 'no_data' ? 'No Data' : 
                                   failed.failureType === 'fetch_failed' ? 'Fetch Failed' : 
                                   'Parsing Failed';
                
                const failedDiv = document.createElement('div');
                failedDiv.className = 'failed-item';
                failedDiv.style.cssText = `
                    background: white;
                    border: 1px solid #e0e0e0;
                    border-radius: 8px;
                    padding: 15px;
                    margin-bottom: 10px;
                    transition: all 0.2s ease;
                `;
                
                failedDiv.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                            <span class="failure-badge ${failureBadgeClass}" style="
                                display: inline-block;
                                padding: 2px 8px;
                                border-radius: 12px;
                                font-size: 11px;
                                font-weight: bold;
                                margin-right: 8px;
                                background: ${failureLabel === 'No Data' ? '#ff9800' : 
                                           failureLabel === 'Fetch Failed' ? '#f44336' : 
                                           '#9c27b0'};
                                color: white;
                            ">
                                ${failureLabel}
                            </span>
                            <strong style="font-size: 14px;">${failed.baseUrl}</strong>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn-scrap-site btn-small btn-primary" 
                                    onclick="scrapFailedSite('${failed._id}', '${failed.baseUrl}', '${failed.staffDirectory}', event)"
                                    style="
                                        padding: 4px 12px;
                                        background: #007bff;
                                        color: white;
                                        border: none;
                                        border-radius: 4px;
                                        font-size: 12px;
                                        cursor: pointer;
                                        transition: background 0.2s;
                                    ">
                                🔄 Retry
                            </button>
                            <button class="btn btn-small btn-secondary" 
                                    onclick="removeFailedSite('${failed._id}', '${failed.baseUrl}', event)"
                                    style="
                                        padding: 4px 12px;
                                        background: #6c757d;
                                        color: white;
                                        border: none;
                                        border-radius: 4px;
                                        font-size: 12px;
                                        cursor: pointer;
                                        transition: background 0.2s;
                                    ">
                                ❌ Remove
                            </button>
                        </div>
                    </div>
                    <div style="margin: 8px 0; font-size: 13px;">
                        <strong>Directory:</strong> 
                        <a href="${failed.staffDirectory}" target="_blank" style="color: #007bff; text-decoration: none;">
                            ${failed.staffDirectory}
                        </a>
                    </div>
                    <div style="margin: 8px 0; font-size: 12px; color: #666;">
                        <strong>Attempts:</strong> ${failed.attemptCount} | 
                        <strong>Last Attempt:</strong> ${new Date(failed.lastAttempt).toLocaleString()}
                    </div>
                    <div style="margin: 8px 0; font-size: 12px; color: #d32f2f;">
                        <strong>Error:</strong> ${failed.errorMessage || 'Unknown error'}
                    </div>
                    ${failed.htmlSnippet ? `
                        <div style="margin: 8px 0; font-size: 12px;">
                            <strong>HTML Snippet:</strong>
                            <div class="html-snippet" style="
                                background: #f8f9fa;
                                border: 1px solid #dee2e6;
                                border-radius: 4px;
                                padding: 8px;
                                margin-top: 4px;
                                font-family: monospace;
                                font-size: 11px;
                                color: #495057;
                                max-height: 60px;
                                overflow-y: auto;
                                white-space: pre-wrap;
                                word-break: break-all;
                            ">
                                ${failed.htmlSnippet}
                            </div>
                        </div>
                    ` : ''}
                `;
                
                // Add hover effect
                failedDiv.onmouseenter = () => {
                    failedDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                    failedDiv.style.transform = 'translateY(-1px)';
                };
                
                failedDiv.onmouseleave = () => {
                    failedDiv.style.boxShadow = 'none';
                    failedDiv.style.transform = 'translateY(0)';
                };
                
                failedDirectoriesList.appendChild(failedDiv);
            });
            
            // Add CSS for button hover effects
            const style = document.createElement('style');
            style.textContent = `
                .btn-scrap-site:hover:not(:disabled) {
                    background: #0056b3 !important;
                }
                .btn-small.btn-secondary:hover:not(:disabled) {
                    background: #545b62 !important;
                }
                .btn-bulk-scrape:hover:not(:disabled) {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(255, 107, 107, 0.3);
                }
            `;
            container.appendChild(style);
            
            failedList.appendChild(container);
            status.innerHTML = `✅ Found ${result.count} failed directories`;
            
        } else {
            failedList.innerHTML = `
                <div class="failed-container" style="
                    background: white;
                    border-radius: 8px;
                    border: 1px solid #e0e0e0;
                    overflow: hidden;
                ">
                    <div class="table-header" style="
                        padding: 15px;
                        background: #f8f9fa;
                        border-bottom: 1px solid #dee2e6;
                        font-weight: bold;
                        font-size: 16px;
                    ">
                        ❌ Failed Directories
                    </div>
                    <div style="padding: 40px 20px; text-align: center; color: #666;">
                        <p style="font-size: 18px; margin-bottom: 10px;">✅ No failed directories found!</p>
                        <small style="font-size: 14px; color: #888;">All directories are successfully processed.</small>
                    </div>
                </div>
            `;
            status.innerHTML = '✅ No failed directories';
        }
        
    } catch (error) {
        status.innerHTML = `❌ Error fetching failed directories: ${error.message}`;
        failedList.innerHTML = `
            <div style="padding: 20px; background: #ffebee; border-radius: 8px; color: #c62828;">
                <strong>❌ Error:</strong> ${error.message}
            </div>
        `;
    }
}

// Also, here's a cleaner version of the scrapFailedSite function:
async function scrapFailedSite(failedId, baseUrl, staffDirectory, event) { 
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }

    const button = event?.target;
    const originalText = button?.textContent;
    
    if (button) {
        button.disabled = true;
        button.textContent = '⏳ Retrying...';
        button.classList.add('loading');
    }

    const status = document.getElementById('status');
    status.innerHTML = `🔄 Retrying failed site: ${baseUrl}...`;

    try {
        // First, remove from failed list
        const removeResponse = await fetch(`/failed-directories/${failedId}`, {
            method: 'DELETE'
        });

        if (!removeResponse.ok) {
            throw new Error('Failed to remove from failed list');
        }

        // Now try to scrape the site
        const response = await fetch('/scrape-failed-site', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                baseUrl: baseUrl,
                staffDirectory: staffDirectory
            })
        });

        const result = await response.json();
        
        if (result.success) {
            status.innerHTML = `
                <div style="padding: 15px; background: #e8f5e9; border-radius: 8px; margin: 10px 0;">
                    <strong>✅ Successfully scraped ${baseUrl}</strong><br>
                    <small>Found ${result.staffCount} staff members</small>
                </div>
            `;
            
            // Update the failed list after a short delay
            setTimeout(() => {
                fetchFailedDirectories();
            }, 1500);
            
        } else {
            status.innerHTML = `
                <div style="padding: 15px; background: #fff3cd; border-radius: 8px; margin: 10px 0;">
                    <strong>❌ Failed to scrape ${baseUrl}</strong><br>
                    <small>${result.error}</small>
                </div>
            `;
            
            // Refresh failed list to show updated attempt count
            setTimeout(() => {
                fetchFailedDirectories();
            }, 1500);
        }

    } catch (error) {
        status.innerHTML = `
            <div style="padding: 15px; background: #ffebee; border-radius: 8px; margin: 10px 0;">
                <strong>❌ Error scraping failed site</strong><br>
                <small>${error.message}</small>
            </div>
        `;
        
        // Refresh failed list
        setTimeout(() => {
            fetchFailedDirectories();
        }, 1500);
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = originalText || '🔄 Retry';
            button.classList.remove('loading');
        }
    }
}