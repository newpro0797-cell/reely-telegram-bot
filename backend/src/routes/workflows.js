const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { encrypt, decrypt } = require('../utils/encryption');

router.use(authMiddleware);

// GET /api/workflows — list user's workflows
router.get('/', async (req, res, next) => {
    try {
        const { data, error } = await req.supabaseUser
            .from('workflows')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        next(err);
    }
});

// GET /api/workflows/:id — get a single workflow
router.get('/:id', async (req, res, next) => {
    try {
        const { data, error } = await req.supabaseUser
            .from('workflows')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Workflow not found' });

        // Mask the API key for client
        if (data.gemini_api_key_encrypted) {
            const decrypted = decrypt(data.gemini_api_key_encrypted);
            data.gemini_api_key_masked = decrypted
                ? '****' + decrypted.slice(-4)
                : null;
        }
        delete data.gemini_api_key_encrypted;

        res.json(data);
    } catch (err) {
        next(err);
    }
});

// POST /api/workflows — create a new workflow
router.post('/', async (req, res, next) => {
    try {
        const {
            name,
            gemini_api_key,
            gemini_model,
            modal_zimage_endpoint,
            modal_kokoro_endpoint,
            kokoro_voice,
            kokoro_speed,
            video_aspect_ratio,
            video_output_resolution,
            transition_effect,
            transition_duration,
            ken_burns_enabled,
            output_quality_crf,
            advanced_settings_json,
        } = req.body;

        const workflowData = {
            user_id: req.user.id,
            name,
            gemini_api_key_encrypted: encrypt(gemini_api_key),
            gemini_model: gemini_model || 'gemini-2.0-flash',
            modal_zimage_endpoint,
            modal_kokoro_endpoint,
            kokoro_voice: kokoro_voice || 'af_sarah',
            kokoro_speed: kokoro_speed || 1.0,
            video_aspect_ratio: video_aspect_ratio || '9:16',
            video_output_resolution: video_output_resolution || '1080x1920',
            transition_effect: transition_effect || 'fade',
            transition_duration: transition_duration || 0.5,
            ken_burns_enabled: ken_burns_enabled !== false,
            output_quality_crf: output_quality_crf || 23,
            advanced_settings_json: advanced_settings_json || null,
        };

        const { data, error } = await req.supabaseUser
            .from('workflows')
            .insert(workflowData)
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (err) {
        next(err);
    }
});

// PUT /api/workflows/:id — update a workflow
router.put('/:id', async (req, res, next) => {
    try {
        const updates = { ...req.body };

        // Re-encrypt API key if it's being updated
        if (updates.gemini_api_key) {
            updates.gemini_api_key_encrypted = encrypt(updates.gemini_api_key);
            delete updates.gemini_api_key;
        }
        // Don't allow changing user_id or id
        delete updates.user_id;
        delete updates.id;
        delete updates.gemini_api_key_masked;

        const { data, error } = await req.supabaseUser
            .from('workflows')
            .update(updates)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        next(err);
    }
});

// DELETE /api/workflows/:id — delete a workflow
router.delete('/:id', async (req, res, next) => {
    try {
        const { error } = await req.supabaseUser
            .from('workflows')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// PATCH /api/workflows/:id/toggle — toggle active/inactive
router.patch('/:id/toggle', async (req, res, next) => {
    try {
        // Get current state
        const { data: workflow, error: fetchError } = await req.supabaseUser
            .from('workflows')
            .select('is_active')
            .eq('id', req.params.id)
            .single();

        if (fetchError) throw fetchError;

        const { data, error } = await req.supabaseUser
            .from('workflows')
            .update({ is_active: !workflow.is_active })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
