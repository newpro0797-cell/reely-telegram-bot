const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { supabaseAdmin } = require('../config/supabase');
const {
    runScriptGeneration,
    runAudioGeneration,
    runImagePromptGeneration,
    runImageGeneration,
    runStitching,
    calculateCredits,
} = require('../pipeline/index');

router.use(authMiddleware);

// POST /api/jobs — create job + generate script (Step 1)
router.post('/', async (req, res, next) => {
    try {
        const { sessionId, prompt } = req.body;
        if (!sessionId || !prompt) {
            return res.status(400).json({ error: 'sessionId and prompt are required' });
        }

        // Create job record
        const { data: job, error: jobError } = await req.supabaseUser
            .from('reel_jobs')
            .insert({
                session_id: sessionId,
                user_id: req.user.id,
                prompt,
                status: 'generating_script',
                log_json: { stages: [] },
            })
            .select()
            .single();

        if (jobError) throw jobError;

        // Update session title from first prompt
        const titleSnippet = prompt.substring(0, 60) + (prompt.length > 60 ? '...' : '');
        await req.supabaseUser
            .from('chat_sessions')
            .update({ title: titleSnippet, updated_at: new Date().toISOString() })
            .eq('id', sessionId);

        // Return job ID immediately
        res.status(201).json({ jobId: job.id });

        // Run script generation (don't await the response to the user)
        runScriptGeneration(job.id, prompt).catch((err) => {
            console.error('[Script Gen Error]', job.id, err.message);
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/jobs/:id — get job state
router.get('/:id', async (req, res, next) => {
    try {
        const { data: job, error } = await req.supabaseUser
            .from('reel_jobs')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;
        if (!job) return res.status(404).json({ error: 'Job not found' });

        res.json(job);
    } catch (err) {
        next(err);
    }
});

// POST /api/jobs/:id/approve-script — approve script, triggers audio gen
router.post('/:id/approve-script', async (req, res, next) => {
    try {
        const { editedScript, editedTitle } = req.body;

        // Optionally update the script if user edited it
        if (editedScript) {
            await supabaseAdmin
                .from('reel_jobs')
                .update({
                    narration_script: editedScript,
                    ...(editedTitle ? { video_title: editedTitle } : {}),
                })
                .eq('id', req.params.id);
        }

        await supabaseAdmin
            .from('reel_jobs')
            .update({ narration_approved: true })
            .eq('id', req.params.id);

        res.json({ success: true, message: 'Script approved — generating audio...' });

        // Run audio generation + image prompt generation sequentially
        (async () => {
            try {
                const audioResult = await runAudioGeneration(req.params.id);

                // Check credits before proceeding
                const totalCredits = calculateCredits(audioResult.totalScenes);
                const { data: profile } = await supabaseAdmin
                    .from('profiles')
                    .select('credits')
                    .eq('id', req.user.id)
                    .single();

                if (profile && profile.credits < totalCredits) {
                    await supabaseAdmin.from('reel_jobs').update({
                        status: 'failed',
                        error_message: `Not enough credits. Need ${totalCredits}, have ${profile.credits}.`,
                    }).eq('id', req.params.id);
                    return;
                }

                // Generate image prompts
                await runImagePromptGeneration(req.params.id);
            } catch (err) {
                console.error('[Audio/Prompts Error]', req.params.id, err.message);
            }
        })();
    } catch (err) {
        next(err);
    }
});

// POST /api/jobs/:id/regenerate-script — regenerate script
router.post('/:id/regenerate-script', async (req, res, next) => {
    try {
        const { data: job } = await req.supabaseUser
            .from('reel_jobs')
            .select('prompt')
            .eq('id', req.params.id)
            .single();

        if (!job) return res.status(404).json({ error: 'Job not found' });

        res.json({ success: true, message: 'Regenerating script...' });

        runScriptGeneration(req.params.id, job.prompt).catch((err) => {
            console.error('[Script Regen Error]', req.params.id, err.message);
        });
    } catch (err) {
        next(err);
    }
});

// POST /api/jobs/:id/regenerate-prompts — regenerate image prompts
router.post('/:id/regenerate-prompts', async (req, res, next) => {
    try {
        // Delete existing scenes
        await supabaseAdmin
            .from('reel_scenes')
            .delete()
            .eq('job_id', req.params.id);

        await supabaseAdmin
            .from('reel_jobs')
            .update({ status: 'generating_image_prompts' })
            .eq('id', req.params.id);

        res.json({ success: true, message: 'Regenerating prompts...' });

        runImagePromptGeneration(req.params.id).catch((err) => {
            console.error('[Prompt Regen Error]', req.params.id, err.message);
        });
    } catch (err) {
        next(err);
    }
});

// POST /api/jobs/:id/approve-prompts — approve image prompts
router.post('/:id/approve-prompts', async (req, res, next) => {
    try {
        const { editedPrompts } = req.body;

        // Update prompts if edited
        if (editedPrompts && Array.isArray(editedPrompts)) {
            for (const ep of editedPrompts) {
                await supabaseAdmin
                    .from('reel_scenes')
                    .update({ image_prompt: ep.image_prompt })
                    .eq('job_id', req.params.id)
                    .eq('scene_number', ep.scene_number);
            }
        }

        await supabaseAdmin
            .from('reel_jobs')
            .update({ image_prompts_approved: true })
            .eq('id', req.params.id);

        res.json({ success: true, message: 'Prompts approved — generating images...' });

        // Start parallel image generation
        runImageGeneration(req.params.id).catch((err) => {
            console.error('[Image Gen Error]', req.params.id, err.message);
        });
    } catch (err) {
        next(err);
    }
});

// POST /api/jobs/:id/retry-scene/:sceneNum — retry a single failed scene
router.post('/:id/retry-scene/:sceneNum', async (req, res, next) => {
    try {
        const sceneNum = parseInt(req.params.sceneNum);

        await supabaseAdmin
            .from('reel_scenes')
            .update({ status: 'pending' })
            .eq('job_id', req.params.id)
            .eq('scene_number', sceneNum);

        res.json({ success: true, message: `Retrying scene ${sceneNum}...` });

        runImageGeneration(req.params.id, sceneNum).catch((err) => {
            console.error('[Scene Retry Error]', req.params.id, sceneNum, err.message);
        });
    } catch (err) {
        next(err);
    }
});

// POST /api/jobs/:id/stitch — start stitching with style options
router.post('/:id/stitch', async (req, res, next) => {
    try {
        const { transition, animation, burnSubtitles, aspectRatio } = req.body;

        res.json({ success: true, message: 'Stitching your reel...' });

        runStitching(req.params.id, { transition, animation, burnSubtitles, aspectRatio }).catch((err) => {
            console.error('[Stitch Error]', req.params.id, err.message);
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/jobs/:id/video-url — get signed URL for completed video
router.get('/:id/video-url', async (req, res, next) => {
    try {
        const { data: job, error: jobError } = await req.supabaseUser
            .from('reel_jobs')
            .select('video_storage_path, user_id')
            .eq('id', req.params.id)
            .single();

        if (jobError) throw jobError;
        if (!job || !job.video_storage_path) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const { data, error } = await supabaseAdmin
            .storage
            .from('reely-videos')
            .createSignedUrl(job.video_storage_path, 3600);

        if (error) throw error;

        res.json({
            signedUrl: data.signedUrl,
            expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/jobs/:id/scenes — get scene images with signed URLs
router.get('/:id/scenes', async (req, res, next) => {
    try {
        const { data: scenes, error } = await req.supabaseUser
            .from('reel_scenes')
            .select('*')
            .eq('job_id', req.params.id)
            .order('scene_number', { ascending: true });

        if (error) throw error;

        const scenesWithUrls = await Promise.all(
            (scenes || []).map(async (scene) => {
                if (scene.image_storage_path) {
                    const { data } = await supabaseAdmin
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
