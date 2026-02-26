const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

// Admin client (bypasses RLS) — use only for admin operations
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
});

// Creates a user-scoped Supabase client that respects RLS
function createUserClient(accessToken) {
    return createClient(supabaseUrl, supabaseAnonKey, {
        global: {
            headers: { Authorization: `Bearer ${accessToken}` },
        },
        auth: { autoRefreshToken: false, persistSession: false },
    });
}

module.exports = { supabaseAdmin, createUserClient };
