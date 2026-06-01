// public/js/site-history.js

document.addEventListener('DOMContentLoaded', async () => {
    // Get siteId from URL path: /changes/site/:siteId
    const pathParts = window.location.pathname.split('/');
    const siteId = pathParts[pathParts.length - 1];

    if (!siteId) {
        console.error('No siteId found in URL');
        return;
    }

    await loadSiteHistory(siteId);
});

async function loadSiteHistory(siteId) {
    const timeline = document.getElementById('historyTimeline');
    const headerContent = document.getElementById('headerContent');

    try {
        const response = await fetch(`/api/site-changes-details/${siteId}?limit=50`);
        const data = await response.json();

        if (!data.site) {
            headerContent.innerHTML = `<h2>Site Not Found</h2>`;
            return;
        }

        // Render Header
        headerContent.innerHTML = `
            <div>
                <h1 class="site-title">${data.site.baseUrl}</h1>
                <div class="site-url"><i class="fas fa-folder"></i> ${data.site.staffDirectory}</div>
            </div>
            <div style="text-align: right;">
                <div class="stat-value" style="font-size: 1.5em; color: #667eea;">${data.statistics.totalChanges}</div>
                <div class="stat-label">Total History Records</div>
            </div>
        `;

        if (!data.changes || data.changes.length === 0) {
            timeline.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-history" style="font-size: 3em; margin-bottom: 15px; color: #ccc;"></i>
                    <h3>No history recorded yet</h3>
                    <p>Changes will appear here as they are captured during scrapes.</p>
                </div>
            `;
            return;
        }

        // Render Timeline Items
        timeline.innerHTML = data.changes.map(change => `
            <div class="timeline-item">
                <div class="timeline-dot"></div>
                <div class="timeline-content">
                    <div class="change-date">
                        <div>
                            <i class="far fa-calendar-alt"></i> ${new Date(change.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        </div>
                        <div class="change-summary-pills">
                            <span class="pill pill-added">+${change.addedCount}</span>
                            <span class="pill pill-removed">-${change.removedCount}</span>
                            <span class="pill pill-updated">~${change.updatedCount}</span>
                        </div>
                    </div>

                    <div style="color: #718096; font-size: 0.9em; margin-bottom: 20px;">
                        Snapshot Range: ${change.fromDate ? new Date(change.fromDate).toLocaleDateString() : 'Initial'} 
                        <i class="fas fa-arrow-right" style="font-size: 0.8em; margin: 0 5px;"></i> 
                        ${change.toDate ? new Date(change.toDate).toLocaleDateString() : 'Current'}
                    </div>

                    ${renderChangeSection('Added Staff', change.details.added, 'pill-added')}
                    ${renderChangeSection('Removed Staff', change.details.removed, 'pill-removed')}
                    ${renderUpdatedSection(change.details.updated)}
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading history:', error);
        timeline.innerHTML = `<div class="error-msg">Error loading site history: ${error.message}</div>`;
    }
}

function renderChangeSection(title, items, pillClass) {
    if (!items || items.length === 0) return '';
    return `
        <div class="diff-container">
            <div class="diff-section-title">${title}</div>
            <div class="staff-grid">
                ${items.map(item => `
                    <div class="staff-card">
                        <div class="staff-name">${item.name}</div>
                        ${item.categories && item.categories.length > 0 ? 
                            `<div style="font-size: 0.8em; color: #718096; margin-top: 4px;">${item.categories.join(', ')}</div>` : ''}
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function renderUpdatedSection(items) {
    if (!items || items.length === 0) return '';
    return `
        <div class="diff-container">
            <div class="diff-section-title">Updated Records</div>
            <div class="staff-grid" style="grid-template-columns: 1fr;">
                ${items.map(item => `
                    <div class="staff-card" style="display: flex; flex-direction: column; gap: 8px;">
                        <div class="staff-name">${item.name}</div>
                        <div style="font-size: 0.85em; background: white; padding: 10px; border-radius: 6px; border: 1px solid #edf2f7;">
                            ${Object.entries(item.diffs).map(([field, diff]) => {
                                const formatVal = (val) => Array.isArray(val) ? val.join(', ') : (val || 'Empty');
                                return `
                                    <div style="margin-bottom: 5px;">
                                        <strong style="text-transform: capitalize; color: #4a5568;">${field}:</strong>
                                        <div style="display: flex; align-items: center; gap: 10px; margin-top: 2px;">
                                            <span style="color: #c53030; text-decoration: line-through; background: #fff5f5; padding: 0 4px;">${formatVal(diff.before)}</span>
                                            <i class="fas fa-long-arrow-alt-right" style="color: #cbd5e0;"></i>
                                            <span style="color: #2f855a; font-weight: 500; background: #f0fff4; padding: 0 4px;">${formatVal(diff.after)}</span>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}
