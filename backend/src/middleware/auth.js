const { supabaseAdmin, createUserClient } = require('../config/supabase');

async function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing or invalid authorization header' });
        }

        const token = authHeader.split(' ')[1];

        // Verify the JWT and get user info
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        req.user = user;
        req.accessToken = token;
        req.supabaseUser = createUserClient(token);

        next();
    } catch (err) {
        console.error('[Auth Middleware Error]', err.message);
        res.status(401).json({ error: 'Authentication failed' });
    }
}

module.exports = authMiddleware;
