 let currentStaffPage = 1;
    let currentSearchQuery = '';

    // Navbar functionality
    function toggleMobileMenu() {
      const menu = document.getElementById('navbarMenu');
      menu.classList.toggle('active');
    }

    // Highlight current page in navbar
    document.addEventListener('DOMContentLoaded', function() {
      const currentPage = window.location.pathname.split('/').pop();
      document.querySelectorAll('.navbar-link').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === currentPage) {
          link.classList.add('active');
        }
      });
    });

    // Search functionality
    function handleSearchKeypress(event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        performStaffSearch();
      }
    }

    async function performStaffSearch(page = 1) {
      const searchQuery = document.getElementById('searchQuery').value.trim();
      const searchField = document.getElementById('searchField').value;
      const exactMatch = document.getElementById('exactMatch').checked;
      const limit = document.getElementById('searchLimit').value;

      if (!searchQuery) {
        alert('Please enter a search term');
        return;
      }

      currentSearchQuery = searchQuery;
      currentStaffPage = page;

      const resultsContainer = document.getElementById('searchResults');
      const paginationContainer = document.getElementById('paginationContainer');

      resultsContainer.innerHTML = `
        <div style="text-align: center; padding: 40px;">
          <div class="loading-indicator"></div>
          <div>Searching staff members...</div>
        </div>
      `;
      paginationContainer.innerHTML = '';

      try {
        // Build query parameters
        const params = new URLSearchParams({
          page: page,
          limit: limit,
          exactMatch: exactMatch
        });
        
        // Add the appropriate search field
        params.append(searchField, searchQuery);
        
        const response = await fetch(`/api/staff/search?${params}`);
        const result = await response.json();
        
        displayStaffResults(result);
        
      } catch (error) {
        resultsContainer.innerHTML = `
          <div class="no-results">
            <div style="color: #e74c3c; font-size: 3em;">❌</div>
            <h3>Search Failed</h3>
            <p>Error: ${error.message}</p>
          </div>
        `;
      }
    }

    function displayStaffResults(result) {
      const resultsContainer = document.getElementById('searchResults');
      const paginationContainer = document.getElementById('paginationContainer');

      if (!result.success) {
        resultsContainer.innerHTML = `
          <div class="no-results">
            <div style="color: #e74c3c; font-size: 3em;">❌</div>
            <h3>Search Failed</h3>
            <p>${result.error}</p>
          </div>
        `;
        return;
      }

      if (result.results.length === 0) {
        resultsContainer.innerHTML = `
          <div class="no-results">
            <div style="color: #666; font-size: 3em;">🔍</div>
            <h3>No Results Found</h3>
            <p>No staff members found matching your search criteria.</p>
            <p>Try adjusting your search terms or using partial matching.</p>
          </div>
        `;
        return;
      }

      let html = `
        <div class="stats" style="margin-bottom: 20px;">
          Found ${result.pagination.totalResults} staff members matching "${currentSearchQuery}"
          ${result.searchCriteria.exactMatch ? '(exact match)' : ''}
        </div>
      `;

      result.results.forEach(staff => {
        html += `
          <div class="staff-card">
            <div class="staff-header">
              <h3 class="staff-name">${staff.name || 'Unknown Name'}</h3>
              <div style="font-size: 0.9em; color: #666;">
                Last seen: ${new Date(staff.latestSeen).toLocaleDateString()}
              </div>
            </div>
            
            <div class="staff-meta">
              <span><strong>Title:</strong> ${staff.title || 'N/A'}</span>
              <span><strong>Category:</strong> ${staff.category || 'N/A'}</span>
            </div>
            
            <div class="contact-info">
              ${staff.emails && staff.emails.length > 0 ? `
                <div class="contact-item">
                  <strong>Email:</strong> ${staff.emails.join(', ')}
                </div>
              ` : ''}
              
              ${staff.phones && staff.phones.length > 0 ? `
                <div class="contact-item">
                  <strong>Phone:</strong> ${staff.phones.join(', ')}
                </div>
              ` : ''}
              
              ${staff.profileUrl ? `
                <div class="contact-item">
                  <strong>Profile:</strong> 
                  <a href="${staff.profileUrl}" target="_blank">View Profile</a>
                </div>
              ` : ''}
            </div>
            
            ${staff.socials && Object.keys(staff.socials).length > 0 ? `
              <div class="contact-item">
                <strong>Social:</strong> 
                ${Object.entries(staff.socials).map(([platform, url]) => 
                  `<a href="${url}" target="_blank" style="margin-right: 10px;">${platform}</a>`
                ).join('')}
              </div>
            ` : ''}
            
            ${staff.description ? `
              <div style="margin-top: 10px; font-size: 0.9em; color: #555;">
                <strong>Description:</strong> ${staff.description}
              </div>
            ` : ''}
            
            <div class="sites-list" style="margin-top: 15px;">
              <strong>Found on sites:</strong><br>
              ${staff.sites.map(site => `
                <a href="${site.baseUrl}${site.staffDirectory}" target="_blank" class="site-badge">
                  ${site.baseUrl}
                </a>
              `).join('')}
            </div>
          </div>
        `;
      });

      resultsContainer.innerHTML = html;

      // Add pagination
      if (result.pagination.totalPages > 1) {
        paginationContainer.innerHTML = createPaginationControls(result.pagination);
      } else {
        paginationContainer.innerHTML = '';
      }
    }

    function createPaginationControls(pagination) {
      return `
        <div style="display: flex; justify-content: center; align-items: center; gap: 10px; margin-top: 20px;">
          ${pagination.hasPrev ? `
            <button class="btn btn-secondary" onclick="performStaffSearch(${pagination.currentPage - 1})">
              ⬅ Previous
            </button>
          ` : ''}
          
          <span style="font-weight: bold; color: #666; margin: 0 15px;">
            Page ${pagination.currentPage} of ${pagination.totalPages}
          </span>
          
          ${pagination.hasNext ? `
            <button class="btn btn-secondary" onclick="performStaffSearch(${pagination.currentPage + 1})">
              Next ➡
            </button>
          ` : ''}
        </div>
      `;
    }

    function clearStaffSearch() {
      document.getElementById('searchQuery').value = '';
      document.getElementById('searchResults').innerHTML = '';
      document.getElementById('paginationContainer').innerHTML = '';
      currentSearchQuery = '';
    }