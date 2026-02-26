import { authenticate, supabaseAdmin } from '../_lib/supabase.js';
import {
    runScriptGeneration,
    runAudioGeneration,
    runImagePromptGeneration,
    runImageGeneration,
    runStitchingViaModal,
    calculateCredits,
} from '../_lib/pipeline.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const auth = await authenticate(req);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const { user, supabaseUser } = auth;
    const pathParts = req.query.path || [];
    const jobId = pathParts[0];
    const action = pathParts[1];

    try {
        // POST /api/jobs — create job + generate script
        if (req.method === 'POST' && !jobId) {
            const { sessionId, prompt } = req.body;
            if (!sessionId || !prompt) {
                return res.status(400).json({ error: 'sessionId and prompt are required' });
            }

            const { data: job, error } = await supabaseUser
                .from('reel_jobs')
                .insert({
                    session_id: sessionId,
                    user_id: user.id,
                    prompt,
                    status: 'generating_script',
                    log_json: { stages: [] },
                })
                .select()
                .single();

            if (error) throw error;

            // Update session title
            const titleSnippet = prompt.substring(0, 60) + (prompt.length > 60 ? '...' : '');
            await supabaseUser.from('chat_sessions')
                .update({ title: titleSnippet, updated_at: new Date().toISOString() })
                .eq('id', sessionId);

            res.status(201).json({ jobId: job.id });

            // Run async
            runScriptGeneration(job.id, prompt).catch(e =>
                console.error('[Script Gen Error]', job.id, e.message)
            );
            return;
        }

        // GET /api/jobs/:id — get job state
        if (req.method === 'GET' && jobId && !action) {
            const { data: job, error } = await supabaseUser
                .from('reel_jobs')
                .select('*')
                .eq('id', jobId)
                .single();

            if (error) throw error;
            if (!job) return res.status(404).json({ error: 'Job not found' });
            return res.json(job);
        }

        // GET /api/jobs/:id/video-url
        if (req.method === 'GET' && action === 'video-url') {
            const { data: job, error } = await supabaseUser
                .from('reel_jobs')
                .select('video_storage_path')
                .eq('id', jobId)
                .single();

            if (error) throw error;
            if (!job?.video_storage_path) return res.status(404).json({ error: 'Video not found' });

            const { data, error: sErr } = await supabaseAdmin.storage
                .from('reely-videos')
                .createSignedUrl(job.video_storage_path, 3600);

            if (sErr) throw sErr;
            return res.json({ signedUrl: data.signedUrl, expiresAt: new Date(Date.now() + 3600000).toISOString() });
        }

        // GET /api/jobs/:id/scenes
        if (req.method === 'GET' && action === 'scenes') {
            const { data: scenes, error } = await supabaseUser
                .from('reel_scenes')
                .select('*')
                .eq('job_id', jobId)
                .order('scene_number', { ascending: true });

            if (error) throw error;

            const scenesWithUrls = await Promise.all(
                (scenes || []).map(async (scene) => {
                    if (scene.image_storage_path) {
                        const { data } = await supabaseAdmin.storage
                            .from('reely-temp')
                            .createSignedUrl(scene.image_storage_path, 3600);
                        return { ...scene, image_url: data?.signedUrl || null };
                    }
                    return { ...scene, image_url: null };
                })
            );
            return res.json(scenesWithUrls);
        }

        // POST /api/jobs/:id/approve-script
        if (req.method === 'POST' && action === 'approve-script') {
            const { editedScript, editedTitle } = req.body || {};

            if (editedScript) {
                await supabaseAdmin.from('reel_jobs').update({
                    narration_script: editedScript,
                    ...(editedTitle ? { video_title: editedTitle } : {}),
                }).eq('id', jobId);
            }

            await supabaseAdmin.from('reel_jobs').update({ narration_approved: true }).eq('id', jobId);
            res.json({ success: true });

            (async () => {
                try {
                    const audioResult = await runAudioGeneration(jobId);
                    const totalCredits = calculateCredits(audioResult.totalScenes);
                    const { data: profile } = await supabaseAdmin.from('profiles').select('credits').eq('id', user.id).single();

                    if (profile && profile.credits < totalCredits) {
                        await supabaseAdmin.from('reel_jobs').update({
                            status: 'failed',
                            error_message: `Not enough credits. Need ${totalCredits}, have ${profile.credits}.`,
                        }).eq('id', jobId);
                        return;
                    }
                    await runImagePromptGeneration(jobId);
                } catch (e) { console.error('[Audio/Prompts Error]', jobId, e.message); }
            })();
            return;
        }

        // POST /api/jobs/:id/regenerate-script
        if (req.method === 'POST' && action === 'regenerate-script') {
            const { data: job } = await supabaseUser.from('reel_jobs').select('prompt').eq('id', jobId).single();
            if (!job) return res.status(404).json({ error: 'Job not found' });

            res.json({ success: true });
            runScriptGeneration(jobId, job.prompt).catch(e => console.error('[Regen Error]', e.message));
            return;
        }

        // POST /api/jobs/:id/approve-prompts
        if (req.method === 'POST' && action === 'approve-prompts') {
            const { editedPrompts } = req.body || {};

            if (editedPrompts && Array.isArray(editedPrompts)) {
                for (const ep of editedPrompts) {
                    await supabaseAdmin.from('reel_scenes')
                        .update({ image_prompt: ep.image_prompt })
                        .eq('job_id', jobId)
                        .eq('scene_number', ep.scene_number);
                }
            }

            await supabaseAdmin.from('reel_jobs').update({ image_prompts_approved: true }).eq('id', jobId);
            res.json({ success: true });
            runImageGeneration(jobId).catch(e => console.error('[Image Gen Error]', e.message));
            return;
        }

        // POST /api/jobs/:id/regenerate-prompts
        if (req.method === 'POST' && action === 'regenerate-prompts') {
            await supabaseAdmin.from('reel_scenes').delete().eq('job_id', jobId);
            await supabaseAdmin.from('reel_jobs').update({ status: 'generating_image_prompts' }).eq('id', jobId);
            res.json({ success: true });
            runImagePromptGeneration(jobId).catch(e => console.error('[Regen Error]', e.message));
            return;
        }

        // POST /api/jobs/:id/retry-scene
        if (req.method === 'POST' && action === 'retry-scene') {
            const { sceneNum } = req.body || {};
            await supabaseAdmin.from('reel_scenes').update({ status: 'pending' }).eq('job_id', jobId).eq('scene_number', sceneNum);
            res.json({ success: true });
            runImageGeneration(jobId, sceneNum).catch(e => console.error('[Retry Error]', e.message));
            return;
        }

        // POST /api/jobs/:id/stitch
        if (req.method === 'POST' && action === 'stitch') {
            const { transition, animation, burnSubtitles, aspectRatio } = req.body || {};
            res.json({ success: true });
            runStitchingViaModal(jobId, { transition, animation, burnSubtitles, aspectRatio }).catch(e =>
                console.error('[Stitch Error]', e.message)
            );
            return;
        }

        return res.status(404).json({ error: 'Not found' });
    } catch (err) {
        console.error('[Jobs Error]', err.message);
        return res.status(500).json({ error: err.message });
    }
}
