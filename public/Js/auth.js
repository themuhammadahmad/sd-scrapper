
    // Check auth status on page load
document.addEventListener('DOMContentLoaded', async function() {
    await checkAuthStatus();
});

async function checkAuthStatus() {
    try {
        const response = await fetch('/api/auth/status');
        const data = await response.json();
        
        const userInfo = document.getElementById('userInfo');
        const loginBtn = document.getElementById('loginBtn');
        const logoutBtn = document.getElementById('logoutBtn');
        
        if (data.isAuthenticated) {
            userInfo.textContent = `Welcome 👋, ${data.user.name}!`;
            loginBtn.style.display = 'none';
            logoutBtn.style.display = 'inline-block';
        } else {
            userInfo.textContent = '';
            loginBtn.style.display = 'inline-block';
            logoutBtn.style.display = 'none';
        }
    } catch (error) {
        console.error('Auth check failed:', error);
    }
}

// Login button handler
document.getElementById('loginBtn')?.addEventListener('click', function() {
    window.location.href = '/login';
});

// Logout button handler
document.getElementById('logoutBtn')?.addEventListener('click', async function() {
    try {
        const response = await fetch('/api/auth/logout', {
            method: 'POST'
        });
        
        const data = await response.json();
        if (data.success) {
            window.location.reload();
        }
    } catch (error) {
        console.error('Logout failed:', error);
    }
});
