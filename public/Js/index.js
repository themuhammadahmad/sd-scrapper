let scrapingStatusInterval = null;

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
    status.innerHTML = '🛑 Stopping scraping process...';

    try {
        const response = await fetch('/stop-scraping', {
            method: 'POST'
        });

        const result = await response.json();
        status.innerHTML = `✅ ${result.message}`;
        
        // Stop status polling
        stopStatusPolling();
        
        // Reset buttons after a short delay
        setTimeout(() => {
            resetScrapingButtons();
        }, 2000);
        
    } catch (error) {
        status.innerHTML = `❌ Error stopping: ${error.message}`;
        resetScrapingButtons();
    }
}

function startStatusPolling() {
    // Clear existing interval
    stopStatusPolling();
    
    // Poll every 3 seconds
    scrapingStatusInterval = setInterval(async () => {
        try {
            const response = await fetch('/scrape-status');
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
        const response = await fetch('/scrape-status');
        const status = await response.json();
        
        if (status.isRunning) {
            // If scraping is already running, enable stop button and start polling
            document.getElementById('startBtn').disabled = true;
            document.getElementById('startBtn').textContent = '⏳ Scraping...';
            document.getElementById('stopBtn').disabled = false;
            startStatusPolling();
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
      
      console.log({search, page, url})
      const response = await fetch(url);
        const result = await response.json();
        console.log(result)
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
                
                siteDiv.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <strong style="flex: 1;">${highlightedUrl}</strong>
                        <span style="font-size: 12px; color: #666;">
                            Last scraped: ${new Date(site.lastScrapedAt).toLocaleString()}
                        </span>
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
            failedList.innerHTML = `
                <div class="failed-container">
                    <div class="table-header">
                        ❌ Failed Directories (${result.count})
                    </div>
                    <div class="failed-stats">
                        <strong>Total Failed:</strong> ${result.count} | 
                        <strong>Last Updated:</strong> ${new Date().toLocaleString()}
                    </div>
            `;
            
            result.failedDirectories.forEach(failed => {
                const failureBadgeClass = `failure-${failed.failureType.replace('_', '-')}`;
                const failureLabel = failed.failureType === 'no_data' ? 'No Data' : 
                                   failed.failureType === 'fetch_failed' ? 'Fetch Failed' : 
                                   'Parsing Failed';
                
                const failedDiv = document.createElement('div');
                failedDiv.className = 'failed-item';
                failedDiv.innerHTML = `
                    <div>
                        <span class="failure-badge ${failureBadgeClass}">${failureLabel}</span>
                        <strong>${failed.baseUrl}</strong>
                    </div>
                    <div style="margin: 5px 0; font-size: 12px;">
                        <strong>Directory:</strong> <a href='${failed.staffDirectory}' target="_blank">${failed.staffDirectory}</a>
                    </div>
                    <div style="margin: 5px 0; font-size: 12px;">
                        <strong>Attempts:</strong> ${failed.attemptCount} | 
                        <strong>Last Attempt:</strong> ${new Date(failed.lastAttempt).toLocaleString()}
                    </div>
                    <div style="margin: 5px 0; font-size: 12px; color: #d32f2f;">
                        <strong>Error:</strong> ${failed.errorMessage || 'Unknown error'}
                    </div>
                    ${failed.htmlSnippet ? `
                        <div style="margin: 5px 0; font-size: 12px;">
                            <strong>HTML Snippet:</strong>
                            <div class="html-snippet">${failed.htmlSnippet}</div>
                        </div>
                    ` : ''}
                `;
                failedList.appendChild(failedDiv);
            });
            
            failedList.innerHTML += `</div>`; // Close failed-container
            status.innerHTML = `✅ Found ${result.count} failed directories`;
        } else {
            failedList.innerHTML = `
                <div class="failed-container">
                    <div class="table-header">
                        ❌ Failed Directories
                    </div>
                    <p>No failed directories found.</p>
                </div>
            `;
            status.innerHTML = '✅ No failed directories';
        }
    } catch (error) {
        status.innerHTML = `❌ Error fetching failed directories: ${error.message}`;
    }
}