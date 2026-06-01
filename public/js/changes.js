console.log("%c🚀 CHANGES.JS LOADED", "color: #667eea; font-size: 20px; font-weight: bold;");
        // Global variables for pagination and search
        let currentPage = 1;
        let totalPages = 1;
        let currentSearch = '';
        let debounceTimer;

        // DOM Elements
        const changedSitesList = document.getElementById('changedSitesList');
        const loadingIndicator = document.getElementById('loadingIndicator');
        const emptyState = document.getElementById('emptyState');
        const pagination = document.getElementById('pagination');
        const siteSearch = document.getElementById('siteSearch');
        const dashboardStats = document.getElementById('dashboardStats');

        // Export Elements
        const generateExportBtn = document.getElementById('generateExportBtn');
        const downloadExportBtn = document.getElementById('downloadExportBtn');
        const exportStatus = document.getElementById('exportStatus');

        let exportPollingInterval = null;

        // --- EXPORT LOGIC ---
        async function checkExportStatus() {
            try {
                const response = await fetch('/api/export-changes/status');
                const data = await response.json();

                if (data.isGenerating) {
                    exportStatus.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Generating export file...`;
                    generateExportBtn.disabled = true;
                    generateExportBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Generating...`;
                    downloadExportBtn.style.display = 'none';
                    
                    // Start polling if not already
                    if (!exportPollingInterval) {
                        exportPollingInterval = setInterval(checkExportStatus, 3000);
                    }
                } else {
                    // Stop polling
                    if (exportPollingInterval) {
                        clearInterval(exportPollingInterval);
                        exportPollingInterval = null;
                    }

                    generateExportBtn.disabled = false;
                    generateExportBtn.innerHTML = `<i class="fas fa-cog"></i> Generate New Export`;

                    if (data.latest) {
                        const date = new Date(data.latest.generatedAt).toLocaleString();
                        exportStatus.innerHTML = `<i class="fas fa-check-circle" style="color: #4CAF50;"></i> Latest: <strong>${data.latest.filename}</strong> (Generated: ${date})`;
                        downloadExportBtn.style.display = 'inline-block';
                        downloadExportBtn.href = '/api/export-changes/download';
                    } else {
                        exportStatus.textContent = "No export file generated yet.";
                        downloadExportBtn.style.display = 'none';
                    }
                }
            } catch (error) {
                console.error('Error checking export status:', error);
            }
        }

        async function startExportGeneration() {
            try {
                generateExportBtn.disabled = true;
                generateExportBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Starting...`;
                
                const response = await fetch('/api/export-changes/generate', { method: 'POST' });
                const data = await response.json();

                if (data.success) {
                    checkExportStatus(); // Start polling
                } else {
                    alert(data.message || 'Failed to start export');
                    checkExportStatus();
                }
            } catch (error) {
                console.error('Error starting export:', error);
                alert('Connection error');
                checkExportStatus();
            }
        }

        // Expanded site tracking
        let expandedSiteId = null;

        // Fetch and display changed sites
        async function fetchChangedSites(page = 1, search = '') {
            loadingIndicator.style.display = 'block';
            changedSitesList.innerHTML = '';
            emptyState.style.display = 'none';
            pagination.innerHTML = '';

            try {
                const response = await fetch(`/sites-with-changes?page=${page}&limit=20&search=${encodeURIComponent(search)}`);
                const data = await response.json();

                // Update stats
                if (data.stats) {
                    displayStats(data.stats);
                }

                // Handle empty results
                if (!data.sites || data.sites.length === 0) {
                    loadingIndicator.style.display = 'none';
                    emptyState.style.display = 'block';
                    return;
                }

                // Update pagination variables
                currentPage = data.pagination.currentPage;
                totalPages = data.pagination.totalPages;

                // Display sites
                displayChangedSites(data.sites);

                // Display pagination
                displayPagination(data.pagination);

                loadingIndicator.style.display = 'none';
            } catch (error) {
                console.error('Error fetching changed sites:', error);
                loadingIndicator.style.display = 'none';
                changedSitesList.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-exclamation-triangle" style="font-size: 3em; margin-bottom: 15px; color: #f44336;"></i>
                        <h3>Error loading data</h3>
                        <p>${error.message}</p>
                        <button onclick="fetchChangedSites()" style="margin-top: 15px; padding: 8px 16px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer;">
                            Retry
                        </button>
                    </div>
                `;
            }
        }

        // Display statistics
        function displayStats(stats) {
            dashboardStats.innerHTML = `
                <div class="stat-card">
                    <div class="stat-value">${stats.totalChangedSites}</div>
                    <div class="stat-label">Directories with Changes</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.totalChanges}</div>
                    <div class="stat-label">Total Change Records</div>
                </div>
            `;
        }

        // Display changed sites
        function displayChangedSites(sites) {
            changedSitesList.innerHTML = sites.map(site => `
                <div class="changed-site-item" data-site-id="${site._id}" onclick="toggleSiteDetails('${site._id}')">
                    <div class="site-header">
                        <div>
                            <span class="site-url">${site.baseUrl}</span>
                            <span class="change-badge badge-added">${site.changeCount} change${site.changeCount !== 1 ? 's' : ''}</span>
                        </div>
                        <div>
                            <i class="fas fa-chevron-${expandedSiteId === site._id ? 'up' : 'down'}"></i>
                        </div>
                    </div>
                    <div class="site-meta">
                        <div class="site-directory">
                            <i class="fas fa-folder"></i> ${site.staffDirectory}
                        </div>
                        <div>
                            <i class="fas fa-clock"></i> Last change: ${new Date(site.lastChange).toLocaleDateString()}
                        </div>
                        <div class="change-count">
                            <i class="fas fa-history"></i> ${site.changeCount} recorded change${site.changeCount !== 1 ? 's' : ''}
                        </div>
                    </div>
                    <div class="changes-details ${expandedSiteId === site._id ? 'expanded' : ''}" id="details-${site._id}"></div>
                </div>
            `).join('');
        }

        // Toggle site details
        async function toggleSiteDetails(siteId) {
            console.log(`🖱️ CLICKED SITE: ${siteId}`);
            const siteElement = document.querySelector(`[data-site-id="${siteId}"]`);
            const detailsElement = document.getElementById(`details-${siteId}`);
            const chevron = siteElement.querySelector('.fa-chevron-down, .fa-chevron-up');

            // If clicking the same site, collapse it
            if (expandedSiteId === siteId) {
                expandedSiteId = null;
                siteElement.classList.remove('expanded');
                detailsElement.classList.remove('expanded');
                chevron.className = 'fas fa-chevron-down';
                return;
            }

            // Collapse previously expanded site
            if (expandedSiteId) {
                const prevSite = document.querySelector(`[data-site-id="${expandedSiteId}"]`);
                if (prevSite) {
                    const prevDetails = document.getElementById(`details-${expandedSiteId}`);
                    const prevChevron = prevSite.querySelector('.fa-chevron-down, .fa-chevron-up');
                    
                    prevSite.classList.remove('expanded');
                    prevDetails.classList.remove('expanded');
                    prevChevron.className = 'fas fa-chevron-down';
                }
            }

            // Expand new site
            expandedSiteId = siteId;
            siteElement.classList.add('expanded');
            detailsElement.classList.add('expanded');
            chevron.className = 'fas fa-chevron-up';

            // Always load details if we are expanding
            await loadSiteChangeDetails(siteId);
        }

        // Load detailed changes for a site
        async function loadSiteChangeDetails(siteId) {
            const detailsElement = document.getElementById(`details-${siteId}`);
            detailsElement.innerHTML = `
                <div class="loading-indicator" style="padding: 20px;">
                    <i class="fas fa-spinner fa-spin"></i> Loading change details...
                </div>
            `;

            try {
                console.log(`🔍 Fetching details for site: ${siteId}`);
                const response = await fetch(`/api/site-changes-details/${siteId}?limit=5`);
                const data = await response.json();
                console.log('📦 Received site details data:', data);
                
                if (data.changes && data.changes.length > 0) {
                    console.table(data.changes);
                } else {
                    console.warn('⚠️ No change records found in the database for this site.');
                }

                if (!data.changes || data.changes.length === 0) {
                    detailsElement.innerHTML = `
                        <div class="empty-state" style="margin: 20px 0; padding: 20px;">
                            <p>No change details available for this site.</p>
                        </div>
                    `;
                    return;
                }

                // Display statistics
                let statsHTML = '';
                if (data.statistics) {
                    statsHTML = `
                        <div style="display: flex; gap: 15px; margin: 15px 0; flex-wrap: wrap;">
                            <div style="background: #e8f5e8; padding: 10px 15px; border-radius: 6px; min-width: 100px;">
                                <div style="font-size: 1.5em; font-weight: bold; color: #2e7d32;">${data.statistics.totalAdded}</div>
                                <div style="font-size: 0.9em; color: #666;">Added</div>
                            </div>
                            <div style="background: #ffebee; padding: 10px 15px; border-radius: 6px; min-width: 100px;">
                                <div style="font-size: 1.5em; font-weight: bold; color: #c62828;">${data.statistics.totalRemoved}</div>
                                <div style="font-size: 0.9em; color: #666;">Removed</div>
                            </div>
                            <div style="background: #fff3e0; padding: 10px 15px; border-radius: 6px; min-width: 100px;">
                                <div style="font-size: 1.5em; font-weight: bold; color: #ef6c00;">${data.statistics.totalUpdated}</div>
                                <div style="font-size: 0.9em; color: #666;">Updated</div>
                            </div>
                        </div>
                    `;
                }

                // Display recent changes
                const changesHTML = data.changes.map(change => `
                    <div class="change-period">
                        ${new Date(change.date).toLocaleDateString()} 
                        (${change.fromDate ? new Date(change.fromDate).toLocaleDateString() : '?'} → ${change.toDate ? new Date(change.toDate).toLocaleDateString() : '?'})
                        <div style="display: inline-flex; gap: 10px; margin-left: 15px;">
                            <span style="background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 12px;">
                                +${change.addedCount}
                            </span>
                            <span style="background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 12px;">
                                -${change.removedCount}
                            </span>
                            <span style="background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 12px;">
                                ~${change.updatedCount}
                            </span>
                        </div>
                    </div>
                    
                    ${change.details.added.length > 0 ? `
                        <div class="change-category">
                            <div class="category-header" style="border-left-color: #4CAF50;">
                                <span>Added Staff (${change.details.added.length})</span>
                            </div>
                            <div class="change-list">
                                ${change.details.added.map(person => `
                                    <div class="change-item">
                                        <div class="change-name">${person.name || 'Unknown'}</div>
                                        ${person.categories && person.categories.length > 0 ? `
                                            <div class="change-categories">
                                                <i class="fas fa-tags"></i> ${person.categories.join(', ')}
                                            </div>
                                        ` : ''}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                    
                    ${change.details.removed.length > 0 ? `
                        <div class="change-category">
                            <div class="category-header" style="border-left-color: #f44336;">
                                <span>Removed Staff (${change.details.removed.length})</span>
                            </div>
                            <div class="change-list">
                                ${change.details.removed.map(person => `
                                    <div class="change-item">
                                        <div class="change-name">${person.name || 'Unknown'}</div>
                                        ${person.categories && person.categories.length > 0 ? `
                                            <div class="change-categories">
                                                <i class="fas fa-tags"></i> ${person.categories.join(', ')}
                                            </div>
                                        ` : ''}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                    
                    ${change.details.updated.length > 0 ? `
                        <div class="change-category">
                            <div class="category-header" style="border-left-color: #ff9800;">
                                <span>Updated Staff (${change.details.updated.length})</span>
                            </div>
                            <div class="change-list">
                                ${change.details.updated.map(person => `
                                    <div class="change-item">
                                        <div class="change-name">${person.name || 'Unknown'}</div>
                                        ${person.diffs ? `
                                            <div class="change-diffs" style="font-size: 0.85em; margin-top: 5px; background: #fff; padding: 8px; border-radius: 4px; border: 1px solid #eee;">
                                                ${Object.entries(person.diffs).map(([field, diff]) => {
                                                    const formatVal = (val) => Array.isArray(val) ? val.join(', ') : (val || 'Empty');
                                                    return `
                                                    <div style="margin-bottom: 4px;">
                                                        <strong style="color: #555; text-transform: capitalize; display: inline-block; min-width: 70px;">${field}:</strong> 
                                                        <span style="color: #d32f2f; text-decoration: line-through; background: #ffebee; padding: 1px 4px; border-radius: 2px;">${formatVal(diff.before)}</span> 
                                                        <i class="fas fa-arrow-right" style="color: #999; font-size: 0.8em; margin: 0 4px;"></i> 
                                                        <span style="color: #2e7d32; font-weight: 500; background: #e8f5e9; padding: 1px 4px; border-radius: 2px;">${formatVal(diff.after)}</span>
                                                    </div>
                                                    `;
                                                }).join('')}
                                            </div>
                                        ` : ''}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                `).join('');

                detailsElement.innerHTML = statsHTML + changesHTML;

                // Add "View All Changes" link
                detailsElement.innerHTML += `
                    <div style="text-align: center; margin-top: 20px;">
                        <a href="/changes/site/${siteId}" 
                           style="display: inline-block; padding: 8px 16px; background: #667eea; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
                            <i class="fas fa-history"></i> View Full History Timeline
                        </a>
                    </div>
                `;

            } catch (error) {
                console.error('Error loading site details:', error);
                detailsElement.innerHTML = `
                    <div class="empty-state" style="margin: 20px 0; padding: 20px;">
                        <p>Error loading change details: ${error.message}</p>
                    </div>
                `;
            }
        }

        // Display pagination
        function displayPagination(paginationData) {
            if (paginationData.totalPages <= 1) {
                pagination.innerHTML = '';
                return;
            }

            let paginationHTML = '';

            // Previous button
            if (paginationData.hasPrev) {
                paginationHTML += `
                    <button class="page-btn" onclick="changePage(${currentPage - 1})">
                        <i class="fas fa-chevron-left"></i> Previous
                    </button>
                `;
            }

            // Page numbers
            const startPage = Math.max(1, currentPage - 2);
            const endPage = Math.min(paginationData.totalPages, currentPage + 2);

            for (let i = startPage; i <= endPage; i++) {
                paginationHTML += `
                    <button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">
                        ${i}
                    </button>
                `;
            }

            // Next button
            if (paginationData.hasNext) {
                paginationHTML += `
                    <button class="page-btn" onclick="changePage(${currentPage + 1})">
                        Next <i class="fas fa-chevron-right"></i>
                    </button>
                `;
            }

            // Page info
            paginationHTML += `
                <div style="margin-left: 15px; color: #666; display: flex; align-items: center;">
                    Page ${currentPage} of ${paginationData.totalPages}
                </div>
            `;

            pagination.innerHTML = paginationHTML;
        }

        // Change page
        function changePage(page) {
            if (page < 1 || page > totalPages) return;
            fetchChangedSites(page, currentSearch);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        // Search functionality with debounce
        function setupSearch() {
            siteSearch.addEventListener('input', function() {
                clearTimeout(debounceTimer);
                const searchTerm = this.value.trim();
                
                debounceTimer = setTimeout(() => {
                    currentSearch = searchTerm;
                    fetchChangedSites(1, searchTerm);
                }, 500); // 500ms debounce
            });
        }


        // Initialize the page
        document.addEventListener('DOMContentLoaded', function() {
            generateExportBtn.addEventListener('click', startExportGeneration);
            checkExportStatus();
            setupSearch();
            fetchChangedSites();
        });