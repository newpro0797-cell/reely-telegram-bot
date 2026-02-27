const { supabaseAdmin, createUserClient } = require('../config/supabase');

async function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing or invalid authorization header' });
        }

        const token = authHeader.split(' ')[1];

        // Verify the JWT via a token-scoped client
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

        const tempClient = require('@supabase/supabase-js').createClient(
            supabaseUrl,
            supabaseAnonKey,
            { global: { headers: { Authorization: `Bearer ${token}` } } }
        );

        const { data: { user }, error } = await tempClient.auth.getUser();

        if (error || !user) {
            console.error('[Auth Middleware] JWT Validation failed:', error?.message || 'No user returned');
            console.error('[Auth Middleware] Token prefix:', token.substring(0, 15) + '...');
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
