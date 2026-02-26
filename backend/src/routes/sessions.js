const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/sessions — list user's chat sessions
router.get('/', async (req, res, next) => {
    try {
        const { data, error } = await req.supabaseUser
            .from('chat_sessions')
            .select('*, reel_jobs(id, status, video_title, created_at)')
            .order('updated_at', { ascending: false });

        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        next(err);
    }
});

// POST /api/sessions — create new session
router.post('/', async (req, res, next) => {
    try {
        const { title } = req.body;
        const { data, error } = await req.supabaseUser
            .from('chat_sessions')
            .insert({
                user_id: req.user.id,
                title: title || 'New Reel',
            })
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (err) {
        next(err);
    }
});

// GET /api/sessions/:id — get single session with jobs
router.get('/:id', async (req, res, next) => {
    try {
        const { data: session, error: sessionError } = await req.supabaseUser
            .from('chat_sessions')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (sessionError) throw sessionError;
        if (!session) return res.status(404).json({ error: 'Session not found' });

        const { data: jobs, error: jobsError } = await req.supabaseUser
            .from('reel_jobs')
            .select('*')
            .eq('session_id', req.params.id)
            .order('created_at', { ascending: true });

        if (jobsError) throw jobsError;

        res.json({ ...session, jobs: jobs || [] });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/sessions/:id — delete session
router.delete('/:id', async (req, res, next) => {
    try {
        const { error } = await req.supabaseUser
            .from('chat_sessions')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
