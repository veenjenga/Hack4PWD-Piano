const express = require('express');
const session = require('express-session');
const axios = require('axios');
const { auth } = require('express-openid-connect');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;
const redirectUri = `http://localhost:${port}/login`;

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views'); // Set the views directory

console.log('Issuer Base URL:', process.env.ISSUER_BASE_URL);
console.log('Client ID:', process.env.CLIENT_ID);
console.log('Secret:', process.env.SECRET);

// Auth0 configuration
const config = {
    authRequired: false,
    auth0Logout: true,
    issuerBaseURL: process.env.ISSUER_BASE_URL,
    baseURL: `http://localhost:${port}`,
    clientID: process.env.CLIENT_ID,
    secret: process.env.SECRET,
};

// Middleware
app.use(express.json());
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
    },
}));

// Initialize Auth0 middleware
app.use(auth(config));
app.use(express.static('public'));

// Root route - renders the login page (index.ejs)
app.get('/', (req, res) => {
    if (req.oidc.isAuthenticated()) {
        res.redirect('/home');
    } else {
        res.render('index'); // Render login page (index.ejs) if not authenticated
    }
});

// Route to authenticate user
app.get('/login', async (req, res) => {
    const { code } = req.query;

    if (code) {
        try {
            const tokenResponse = await axios.post(`${process.env.ISSUER_BASE_URL}/oauth/token`, {
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.SECRET,
                code,
                grant_type: 'authorization_code',
                redirect_uri: redirectUri,
            });

            req.session.accessToken = tokenResponse.data.access_token;
            console.log('Access Token:', req.session.accessToken); // Log the access token

            res.redirect('/home');
        } catch (error) {
            console.error('Error during token exchange:', error);
            res.status(500).send('Authentication error');
        }
    } else {
        const redirectUri = `${process.env.ISSUER_BASE_URL}/authorize?response_type=code&client_id=${process.env.CLIENT_ID}&redirect_uri=${redirectUri}`;
        res.redirect(redirectUri);
    }
});

// Middleware to check authentication
const checkAuth = (req, res, next) => {
    if (req.session && req.session.accessToken) {
        console.log('User is authenticated');
        return next();
    }
    console.log('User is not authenticated, redirecting to login');
    res.redirect('/'); // Redirect to login if not authenticated
};

// Home route - renders home.ejs after successful login
app.get('/home', (req, res) => {
    if (req.oidc.isAuthenticated()) {
        res.render('home', { user: req.oidc.user });
    } else {
        console.log('User is not authenticated, redirecting to login');
        res.redirect('/'); // Redirect to login if not authenticated
    }
});

// Fetch user profile
app.get('/profile', checkAuth, async (req, res) => {
    try {
        const userResponse = await axios.get(`${process.env.ISSUER_BASE_URL}/userinfo`, {
            headers: {
                Authorization: `Bearer ${req.session.accessToken}`,
            },
        });
        console.log('User Profile Response:', userResponse.data); // Log user profile response
        res.render('profile', { user: userResponse.data }); // Render profile view
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).send('Error fetching user profile');
    }
});

// Route to handle shopping login
app.get('/login/shopping', (req, res) => {
    const redirectUri = `${process.env.ISSUER_BASE_URL}/authorize?response_type=code&client_id=${process.env.CLIENT_ID}&redirect_uri=http://localhost:3002/login/shopping/callback`;
    res.redirect(redirectUri);
});

// Route to handle the callback after Auth0 login for shopping
app.get('/login/shopping/callback', async (req, res) => {
    const { code } = req.query;

    if (code) {
        try {
            const tokenResponse = await axios.post(`${process.env.ISSUER_BASE_URL}/oauth/token`, {
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.SECRET,
                code,
                grant_type: 'authorization_code',
                redirect_uri: `http://localhost:3002/login/shopping/callback`,
            });

            req.session.accessToken = tokenResponse.data.access_token;
            console.log('Access Token:', req.session.accessToken); // Log the access token

            // Redirect to the shopping page after successful login
            res.redirect('/shopping');
        } catch (error) {
            console.error('Error during token exchange:', error);
            res.status(500).send('Authentication error');
        }
    } else {
        console.error('No code provided in callback');
        res.status(400).send('No code provided');
    }
});

// Shopping route - displays shopping.ejs
app.get('/shopping', async (req, res) => {
    try {
        if (req.session && req.session.accessToken) {
            console.log('Access Token:', req.session.accessToken); // Log access token for debugging

            const userResponse = await axios.get(`${process.env.ISSUER_BASE_URL}/userinfo`, {
                headers: {
                    Authorization: `Bearer ${req.session.accessToken}`,
                },
            });

            const user = userResponse.data;
            const shoppingItems = user.shopping_items || []; // Default to empty array if not found
            const shoppingHistory = user.shopping_history || []; // Default to empty array if not found
            const shoppingPreferences = user.shopping_preferences || []; // Default to empty array if not found

            console.log('User Shopping Response:', user); // Log user shopping response
            res.render('shopping', { user, shoppingItems, shoppingHistory, shoppingPreferences }); // Render shopping view
        } else {
            // If user is not authenticated, render shopping view with login prompt
            console.log('User is not authenticated');
            res.render('shopping', { user: null, shoppingItems: [], shoppingHistory: [], shoppingPreferences: [], message: 'Please log in to view your shopping dashboard.' });
        }
    } catch (error) {
        console.error('Error fetching user shopping dashboard:', error.response ? error.response.data : error.message);
        res.status(500).send('Error fetching user shopping dashboard. Please try again later.');
    }
});





// Logout route - destroys the session and logs the user out
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect(`${process.env.ISSUER_BASE_URL}/v2/logout?returnTo=http://localhost:${port}`);
});

// Start server
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
