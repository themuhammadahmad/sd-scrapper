import express from 'express';
import User from '../models/User.js';

const router = express.Router();

// Signup Route
router.post('/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }
        
        // Create new user
        const user = new User({ name, email, password });
        await user.save();
        
        // Set user in session
        req.session.user = {
            id: user._id,
            name: user.name,
            email: user.email
        };
        
        res.json({ 
            success: true, 
            message: 'User created successfully',
            user: {
                id: user._id,
                name: user.name,
                email: user.email
            }
        });
        
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Login Route
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        
        // Check password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        
        // Set user in session
        req.session.user = {
            id: user._id,
            name: user.name,
            email: user.email
        };
        
        res.json({ 
            success: true, 
            message: 'Login successful',
            user: {
                id: user._id,
                name: user.name,
                email: user.email
            }
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Logout Route
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.clearCookie('connect.sid');
        res.json({ success: true, message: 'Logged out successfully' });
    });
});

// Check auth status
router.get('/status', (req, res) => {
    if (req.session.user) {
        res.json({ 
            isAuthenticated: true, 
            user: req.session.user 
        });
    } else {
        res.json({ isAuthenticated: false });
    }
});

export default router;