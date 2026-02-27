import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

// Admin client (bypasses RLS) — use only for admin operations
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
});

// Creates a user-scoped Supabase client that respects RLS
export function createUserClient(accessToken) {
    return createClient(supabaseUrl, supabaseAnonKey, {
        global: {
            headers: { Authorization: `Bearer ${accessToken}` },
        },
        auth: { autoRefreshToken: false, persistSession: false },
    });
}

// Auth middleware for serverless functions
export async function authenticate(req) {
    const authHeader = req.headers.authorization || req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { error: 'Missing or invalid authorization header', status: 401 };
    }

    const token = authHeader.split(' ')[1];

    // Create a temporary client to verify the JWT
    const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } }
    });

    const { data: { user }, error } = await tempClient.auth.getUser();

    if (error || !user) {
        console.error('[API Auth] JWT Validation failed:', error?.message);
        return { error: 'Invalid or expired token', status: 401 };
    }

    return {
        user,
        accessToken: token,
        supabaseUser: createUserClient(token),
    };
}
