const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/runs/:runId — get a single run with scenes
router.get('/:runId', async (req, res, next) => {
    try {
        const { data: run, error: runError } = await req.supabaseUser
            .from('workflow_runs')
            .select('*')
            .eq('id', req.params.runId)
            .single();

        if (runError) throw runError;
        if (!run) return res.status(404).json({ error: 'Run not found' });

        const { data: scenes, error: scenesError } = await req.supabaseUser
            .from('run_scenes')
            .select('*')
            .eq('run_id', req.params.runId)
            .order('scene_number', { ascending: true });

        if (scenesError) throw scenesError;

        res.json({ ...run, scenes: scenes || [] });
    } catch (err) {
        next(err);
    }
});

// GET /api/runs/:runId/video-url — generate signed URL for video
router.get('/:runId/video-url', async (req, res, next) => {
    try {
        const { data: run, error: runError } = await req.supabaseUser
            .from('workflow_runs')
            .select('video_storage_path')
            .eq('id', req.params.runId)
            .single();

        if (runError) throw runError;
        if (!run || !run.video_storage_path) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const { data, error } = await req.supabaseUser
            .storage
            .from('reely-videos')
            .createSignedUrl(run.video_storage_path, 3600);

        if (error) throw error;

        res.json({
            signedUrl: data.signedUrl,
            expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/runs/:runId/scenes — get scene thumbnails with signed URLs
router.get('/:runId/scenes', async (req, res, next) => {
    try {
        const { data: scenes, error } = await req.supabaseUser
            .from('run_scenes')
            .select('*')
            .eq('run_id', req.params.runId)
            .order('scene_number', { ascending: true });

        if (error) throw error;

        // Generate signed URLs for scene images
        const scenesWithUrls = await Promise.all(
            (scenes || []).map(async (scene) => {
                if (scene.image_storage_path) {
                    const { data } = await req.supabaseUser
                        .storage
                        .from('reely-temp')
                        .createSignedUrl(scene.image_storage_path, 3600);
                    return { ...scene, image_url: data?.signedUrl || null };
                }
                return { ...scene, image_url: null };
            })
        );

        res.json(scenesWithUrls);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
