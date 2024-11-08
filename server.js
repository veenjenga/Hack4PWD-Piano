const express = require('express');
const session = require('express-session');
const axios = require('axios');
const { auth, requiresAuth } = require('express-openid-connect');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;
const redirectUri = `http://localhost:${port}/login`;

app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');

console.log('Issuer Base URL:', process.env.ISSUER_BASE_URL);
console.log('Client ID:', process.env.CLIENT_ID);
console.log('Secret:', process.env.SECRET);

const config = {
    authRequired: false,
    auth0Logout: true,
    issuerBaseURL: process.env.ISSUER_BASE_URL,
    baseURL: `http://localhost:${port}`,
    clientID: process.env.CLIENT_ID,
    secret: process.env.SECRET,
};

const adminCredentials = {
    "jasemwaura@gmail.com": true, // Example admin user
    "anotheradmin@example.com": true,
};

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

app.use(auth(config));
app.use(express.static('public'));

app.get('/', (req, res) => {
    if (req.oidc.isAuthenticated()) {
        res.redirect('/home');
    } else {
        res.render('login');
    }
});

app.get('/home', requiresAuth(), (req, res) => {
    res.render('home', { user: req.oidc.user });
});

app.get('/about', (req, res) => {
    res.render('about');
});

app.get('/profile', requiresAuth(), async (req, res) => {
    try {
        const userResponse = await axios.get(`${process.env.ISSUER_BASE_URL}/userinfo`, {
            headers: {
                Authorization: `Bearer ${req.oidc.accessToken}`,
            },
        });
        const user = userResponse.data;

        if (adminCredentials[user.email]) {
            res.redirect('/admin');
        } else {
            res.render('profile', { user });
        }
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).send('Error fetching user profile');
    }
});

app.get('/login/shopping', (req, res) => {
    const redirectUri = `${process.env.ISSUER_BASE_URL}/authorize?response_type=code&client_id=${process.env.CLIENT_ID}&redirect_uri=http://localhost:3002/login/shopping/callback`;
    res.redirect(redirectUri);
});

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

app.get('/shopping', async (req, res) => {
    try {
        if (req.session && req.session.accessToken) {
            const userResponse = await axios.get(`${process.env.ISSUER_BASE_URL}/userinfo`, {
                headers: {
                    Authorization: `Bearer ${req.session.accessToken}`,
                },
            });

            const user = userResponse.data;
            const shoppingItems = user.shopping_items || [];
            const shoppingHistory = user.shopping_history || [];
            const shoppingPreferences = user.shopping_preferences || [];

            res.render('shopping', { user, shoppingItems, shoppingHistory, shoppingPreferences });
        } else {
            res.render('shopping', { user: null, shoppingItems: [], shoppingHistory: [], shoppingPreferences: [], message: 'Please log in to view your shopping dashboard.' });
        }
    } catch (error) {
        console.error('Error fetching user shopping dashboard:', error);
        res.status(500).send('Error fetching user shopping dashboard. Please try again later.');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect(`${process.env.ISSUER_BASE_URL}/v2/logout?returnTo=http://localhost:${port}`);
});

app.get('/admin', requiresAuth(), (req, res) => {
    res.render('admin', { user: req.oidc.user });
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
