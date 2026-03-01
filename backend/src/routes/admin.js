const express = require('express');
const { supabaseAdmin } = require('../config/supabase');

const router = express.Router();

// Middleware to ensure admin user (in a real app, verify they have admin role)
const verifyAdmin = async (req, res, next) => {
    // Relying on global auth middleware for basic auth (JWT to Supabase user)
    // For this single-tenant app, all logged-in users are admins.
    next();
};

router.use(verifyAdmin);

// Get Jobs List
router.get('/jobs', async (req, res, next) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('video_jobs')
            .select(`
                id, 
                status, 
                target_duration_seconds, 
                created_at,
                inbound_messages(sender_id) 
            `)
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;
        res.json(data);
    } catch (err) {
        next(err);
    }
});

// Get Single Job
router.get('/jobs/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const { data: job, error } = await supabaseAdmin
            .from('video_jobs')
            .select('*, inbound_messages(*)')
            .eq('id', id)
            .single();

        if (error) throw error;

        const { data: events, error: evError } = await supabaseAdmin
            .from('job_events')
            .select('*')
            .eq('job_id', id)
            .order('created_at', { ascending: true });

        if (evError) throw evError;

        res.json({ job, events });
    } catch (err) {
        next(err);
    }
});

// Retry a failed job
router.post('/jobs/:id/retry', async (req, res, next) => {
    try {
        const { id } = req.params;
        const { error } = await supabaseAdmin
            .from('video_jobs')
            .update({ status: 'queued', retry_count: 0 })
            .eq('id', id);

        if (error) throw error;

        await supabaseAdmin.from('job_events').insert({
            job_id: id,
            event_type: 'manual_retry_triggered',
        });

        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// Get Settings
router.get('/settings', async (req, res, next) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('admin_settings')
            .select('key, value');

        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        next(err);
    }
});

// Update Settings
router.post('/settings', async (req, res, next) => {
    try {
        const settingsMap = req.body;

        const upserts = Object.keys(settingsMap).map(key => ({
            key,
            value: settingsMap[key],
            updated_at: new Date().toISOString()
        }));

        const { error } = await supabaseAdmin
            .from('admin_settings')
            .upsert(upserts, { onConflict: 'key' });

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// Simulate Webhook Payload
router.post('/playground/simulate', async (req, res, next) => {
    try {
        const { text_content, sender_id } = req.body;

        // 1. Insert Inbound MSG
        const { data: inboundMsg, error: inbError } = await supabaseAdmin
            .from('inbound_messages')
            .insert({
                platform_message_id: 'PLAYGROUND_' + Date.now(),
                sender_id: sender_id || 'admin_tester',
                text_content: text_content,
                status: 'pending'
            })
            .select()
            .single();

        if (inbError) throw inbError;

        let targetDurationSeconds = 15;
        const durationMatch = text_content.match(/(\d+)\s*(sec|s|second(s?))/i);
        if (durationMatch) {
            targetDurationSeconds = parseInt(durationMatch[1], 10);
            targetDurationSeconds = Math.min(targetDurationSeconds, 45);
        }

        // 2. Queue Job
        const { error: jobError } = await supabaseAdmin
            .from('video_jobs')
            .insert({
                message_id: inboundMsg.id,
                target_duration_seconds: targetDurationSeconds,
                status: 'queued'
            });

        if (jobError) throw jobError;

        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
