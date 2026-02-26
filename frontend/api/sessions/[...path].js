import { authenticate, supabaseAdmin } from '../_lib/supabase.js';

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const auth = await authenticate(req);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const { user, supabaseUser } = auth;
    const pathParts = (req.query.path || []);
    const sessionId = pathParts[0];

    try {
        // GET /api/sessions — list sessions
        if (req.method === 'GET' && !sessionId) {
            const { data, error } = await supabaseUser
                .from('chat_sessions')
                .select('*, reel_jobs(id, status, video_title, created_at)')
                .order('updated_at', { ascending: false });

            if (error) throw error;
            return res.json(data || []);
        }

        // POST /api/sessions — create session
        if (req.method === 'POST' && !sessionId) {
            const { title } = req.body || {};
            const { data, error } = await supabaseUser
                .from('chat_sessions')
                .insert({ user_id: user.id, title: title || 'New Reel' })
                .select()
                .single();

            if (error) throw error;
            return res.status(201).json(data);
        }

        // GET /api/sessions/:id — get session with jobs
        if (req.method === 'GET' && sessionId) {
            const { data: session, error: sErr } = await supabaseUser
                .from('chat_sessions')
                .select('*')
                .eq('id', sessionId)
                .single();

            if (sErr) throw sErr;
            if (!session) return res.status(404).json({ error: 'Session not found' });

            const { data: jobs, error: jErr } = await supabaseUser
                .from('reel_jobs')
                .select('*')
                .eq('session_id', sessionId)
                .order('created_at', { ascending: true });

            if (jErr) throw jErr;
            return res.json({ ...session, jobs: jobs || [] });
        }

        // DELETE /api/sessions/:id
        if (req.method === 'DELETE' && sessionId) {
            const { error } = await supabaseUser
                .from('chat_sessions')
                .delete()
                .eq('id', sessionId);

            if (error) throw error;
            return res.json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err) {
        console.error('[Sessions Error]', err.message);
        return res.status(500).json({ error: err.message });
    }
}
