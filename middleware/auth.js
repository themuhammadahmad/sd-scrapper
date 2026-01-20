// Auth middleware
export const requireAuth = (req, res, next) => {
    console.log("requireAuth", req.session.user)
    if (!req.session.user) {
      console.log("not logged in")
        return res.redirect('/login');
    }
    next();
};

// Auth middleware for API routes
export const requireAuthAPI = (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    next();
};

