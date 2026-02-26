const { generateScript, generateScenePrompts } = require('./gemini');
const { generateAudio } = require('./kokoro');
const { generateImage } = require('./zimage');
const { stitchVideo } = require('./ffmpeg');
const { uploadToTemp, uploadToVideos, downloadFromTemp, cleanupTemp } = require('./storage');
const { supabaseAdmin } = require('../config/supabase');
const fs = require('fs');
const path = require('path');

async function updateJob(jobId, updates) {
    const { error } = await supabaseAdmin
        .from('reel_jobs')
        .update(updates)
        .eq('id', jobId);
    if (error) console.error('[updateJob Error]', error.message);
}

async function appendLog(jobId, stage, message) {
    const { data } = await supabaseAdmin
        .from('reel_jobs')
        .select('log_json')
        .eq('id', jobId)
        .single();

    const log = data?.log_json || { stages: [] };
    log.stages.push({ stage, message, timestamp: new Date().toISOString() });
    await updateJob(jobId, { log_json: log });
}

// ===== STEP 1: Generate Script =====
async function runScriptGeneration(jobId, prompt) {
    try {
        await updateJob(jobId, { status: 'generating_script' });
        await appendLog(jobId, 'script_generation', 'Generating narration script with Gemini...');

        const result = await generateScript(prompt);

        await updateJob(jobId, {
            video_title: result.video_title,
            narration_script: result.narration_script,
            status: 'awaiting_script_approval',
        });
        await appendLog(jobId, 'script_generation', `Script generated: "${result.video_title}"`);

        return result;
    } catch (err) {
        await updateJob(jobId, { status: 'failed', error_message: err.message });
        await appendLog(jobId, 'script_generation', `Error: ${err.message}`);
        throw err;
    }
}

// ===== STEP 2: Generate Audio (after script approval) =====
async function runAudioGeneration(jobId) {
    try {
        const { data: job } = await supabaseAdmin
            .from('reel_jobs')
            .select('narration_script, user_id')
            .eq('id', jobId)
            .single();

        if (!job) throw new Error('Job not found');

        await updateJob(jobId, { status: 'generating_audio' });
        await appendLog(jobId, 'audio_generation', 'Generating voiceover with Kokoro TTS...');

        const audioResult = await generateAudio(job.narration_script);

        // Upload audio to temp storage
        const audioStoragePath = `${job.user_id}/${jobId}/audio.wav`;
        await uploadToTemp(audioStoragePath, audioResult.audioBuffer, 'audio/wav');

        const totalScenes = Math.ceil(audioResult.durationSeconds / 5);

        await updateJob(jobId, {
            audio_duration_seconds: audioResult.durationSeconds,
            total_scenes: totalScenes,
            status: 'generating_image_prompts',
        });
        await appendLog(jobId, 'audio_generation', `Audio generated: ${audioResult.durationSeconds}s, ${totalScenes} scenes`);

        return {
            durationSeconds: audioResult.durationSeconds,
            totalScenes,
        };
    } catch (err) {
        await updateJob(jobId, { status: 'failed', error_message: err.message });
        await appendLog(jobId, 'audio_generation', `Error: ${err.message}`);
        throw err;
    }
}

// ===== STEP 3: Generate Image Prompts =====
async function runImagePromptGeneration(jobId) {
    try {
        const { data: job } = await supabaseAdmin
            .from('reel_jobs')
            .select('narration_script, total_scenes, audio_duration_seconds, user_id')
            .eq('id', jobId)
            .single();

        if (!job) throw new Error('Job not found');

        await appendLog(jobId, 'image_prompts', 'Generating scene image prompts with Gemini...');

        const scenePrompts = await generateScenePrompts(job.narration_script, job.total_scenes);

        // Calculate scene durations
        const scenes = scenePrompts.scenes.map((scene, idx) => {
            const sceneNum = idx + 1;
            let duration;
            if (sceneNum < job.total_scenes) {
                duration = 5.0;
            } else {
                duration = job.audio_duration_seconds - (job.total_scenes - 1) * 5.0;
            }
            return { ...scene, scene_number: sceneNum, display_duration_seconds: duration };
        });

        // Insert scene rows
        for (const scene of scenes) {
            await supabaseAdmin.from('reel_scenes').insert({
                job_id: jobId,
                user_id: job.user_id,
                scene_number: scene.scene_number,
                image_prompt: scene.image_prompt,
                narration_segment: scene.narration_segment || '',
                display_duration_seconds: scene.display_duration_seconds,
                status: 'pending',
            });
        }

        await updateJob(jobId, {
            image_prompts_json: scenes,
            status: 'awaiting_prompts_approval',
        });
        await appendLog(jobId, 'image_prompts', `Generated ${scenes.length} scene prompts`);

        return scenes;
    } catch (err) {
        await updateJob(jobId, { status: 'failed', error_message: err.message });
        await appendLog(jobId, 'image_prompts', `Error: ${err.message}`);
        throw err;
    }
}

// ===== STEP 4: Generate Images (parallel) =====
async function runImageGeneration(jobId, singleSceneNum = null) {
    try {
        const { data: job } = await supabaseAdmin
            .from('reel_jobs')
            .select('user_id, total_scenes')
            .eq('id', jobId)
            .single();

        if (!job) throw new Error('Job not found');

        if (!singleSceneNum) {
            await updateJob(jobId, { status: 'generating_images' });
        }
        await appendLog(jobId, 'image_generation', singleSceneNum
            ? `Retrying scene ${singleSceneNum}...`
            : 'Generating scene images in parallel...');

        // Get scenes to generate
        let query = supabaseAdmin
            .from('reel_scenes')
            .select('*')
            .eq('job_id', jobId)
            .order('scene_number', { ascending: true });

        if (singleSceneNum) {
            query = query.eq('scene_number', singleSceneNum);
        }

        const { data: scenes } = await query;
        if (!scenes || scenes.length === 0) throw new Error('No scenes found');

        const imagePromises = scenes.map(async (scene) => {
            const sceneNum = scene.scene_number;
            try {
                const imageBuffer = await generateImage(scene.image_prompt, 1080, 1920, 9, 0.0, null);

                // Upload to temp storage
                const imgStoragePath = `${job.user_id}/${jobId}/scene_${sceneNum}.png`;
                await uploadToTemp(imgStoragePath, imageBuffer, 'image/png');

                // Update scene record
                await supabaseAdmin
                    .from('reel_scenes')
                    .update({ status: 'complete', image_storage_path: imgStoragePath })
                    .eq('job_id', jobId)
                    .eq('scene_number', sceneNum);

                await appendLog(jobId, 'image_generation', `Scene ${sceneNum} of ${job.total_scenes} complete`);
                return { sceneNum, success: true };
            } catch (err) {
                console.error(`[Scene ${sceneNum} Error]`, err.message);

                await supabaseAdmin
                    .from('reel_scenes')
                    .update({ status: 'failed' })
                    .eq('job_id', jobId)
                    .eq('scene_number', sceneNum);

                await appendLog(jobId, 'image_generation', `Scene ${sceneNum} failed: ${err.message}`);
                return { sceneNum, success: false, error: err.message };
            }
        });

        const results = await Promise.all(imagePromises);
        const failed = results.filter(r => !r.success);

        if (failed.length > 0 && !singleSceneNum) {
            // Some scenes failed but we don't fail the entire job
            await appendLog(jobId, 'image_generation', `${failed.length} scene(s) failed. User can retry individual scenes.`);
        }

        if (failed.length === 0 || singleSceneNum) {
            await updateJob(jobId, { status: 'awaiting_style_selection' });
        }

        return results;
    } catch (err) {
        await updateJob(jobId, { status: 'failed', error_message: err.message });
        await appendLog(jobId, 'image_generation', `Error: ${err.message}`);
        throw err;
    }
}

// ===== STEP 5: Stitch Video =====
async function runStitching(jobId, options = {}) {
    const tmpDir = `/tmp/${jobId}`;

    try {
        const { data: job } = await supabaseAdmin
            .from('reel_jobs')
            .select('*')
            .eq('id', jobId)
            .single();

        if (!job) throw new Error('Job not found');

        await updateJob(jobId, {
            status: 'stitching',
            selected_transition: options.transition || job.selected_transition || 'fade',
            selected_animation: options.animation || job.selected_animation || 'ken_burns',
            burn_subtitles: options.burnSubtitles !== undefined ? options.burnSubtitles : job.burn_subtitles,
            video_aspect_ratio: options.aspectRatio || job.video_aspect_ratio || '9:16',
        });
        await appendLog(jobId, 'stitching', 'Stitching video with FFmpeg...');

        // Get scenes
        const { data: scenes } = await supabaseAdmin
            .from('reel_scenes')
            .select('*')
            .eq('job_id', jobId)
            .eq('status', 'complete')
            .order('scene_number', { ascending: true });

        if (!scenes || scenes.length === 0) throw new Error('No completed scenes to stitch');

        // Create tmp directory
        fs.mkdirSync(tmpDir, { recursive: true });

        // Download all assets from temp storage
        for (const scene of scenes) {
            if (scene.image_storage_path) {
                const imgBuffer = await downloadFromTemp(scene.image_storage_path);
                fs.writeFileSync(path.join(tmpDir, `scene_${scene.scene_number}.png`), imgBuffer);
            }
        }

        // Download audio
        const audioStoragePath = `${job.user_id}/${jobId}/audio.wav`;
        const audioBuffer = await downloadFromTemp(audioStoragePath);
        const audioPath = path.join(tmpDir, 'audio.wav');
        fs.writeFileSync(audioPath, audioBuffer);

        // Determine resolution from aspect ratio
        const aspectRatio = options.aspectRatio || job.video_aspect_ratio || '9:16';
        let resolution = '1080x1920';
        if (aspectRatio === '1:1') resolution = '1080x1080';
        else if (aspectRatio === '16:9') resolution = '1920x1080';

        const outputPath = path.join(tmpDir, 'final.mp4');
        const selectedAnimation = options.animation || job.selected_animation || 'ken_burns';
        const selectedTransition = options.transition || job.selected_transition || 'fade';

        await stitchVideo({
            runId: jobId,
            tmpDir,
            scenes,
            audioPath,
            outputPath,
            resolution,
            crf: 23,
            kenBurns: selectedAnimation === 'ken_burns',
            transitionEffect: selectedTransition,
            transitionDuration: 0.5,
        });

        // Upload final video
        await appendLog(jobId, 'stitching', 'Uploading final video...');
        const videoBuffer = fs.readFileSync(outputPath);
        const videoStoragePath = `${job.user_id}/${jobId}/final.mp4`;
        await uploadToVideos(videoStoragePath, videoBuffer, 'video/mp4');

        // Cleanup temp storage
        await cleanupTemp(job.user_id, jobId);

        // Cleanup local tmp
        fs.rmSync(tmpDir, { recursive: true, force: true });

        // Calculate and deduct credits
        const totalCredits = 9 + (job.total_scenes * 5);
        await completeJob(jobId, videoStoragePath, totalCredits);

        return { videoStoragePath, creditsDeducted: totalCredits };
    } catch (err) {
        // Cleanup on failure
        try {
            if (fs.existsSync(tmpDir)) {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            }
        } catch (e) { /* ignore */ }

        await updateJob(jobId, { status: 'failed', error_message: err.message });
        await appendLog(jobId, 'stitching', `Error: ${err.message}`);
        throw err;
    }
}

// ===== STEP 6: Complete Job — deduct credits =====
async function completeJob(jobId, videoStoragePath, totalCredits) {
    const { data: job } = await supabaseAdmin
        .from('reel_jobs')
        .select('user_id')
        .eq('id', jobId)
        .single();

    if (!job) throw new Error('Job not found');

    // Get current credits
    const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('credits, total_videos_created')
        .eq('id', job.user_id)
        .single();

    if (!profile) throw new Error('Profile not found');

    const creditsBefore = profile.credits;
    const creditsAfter = creditsBefore - totalCredits;

    // Deduct credits
    await supabaseAdmin
        .from('profiles')
        .update({
            credits: creditsAfter,
            total_videos_created: (profile.total_videos_created || 0) + 1,
        })
        .eq('id', job.user_id);

    // Record transaction
    await supabaseAdmin.from('credit_transactions').insert({
        user_id: job.user_id,
        job_id: jobId,
        type: 'video_creation',
        credits_before: creditsBefore,
        credits_change: -totalCredits,
        credits_after: creditsAfter,
        description: `Video creation — ${totalCredits} credits`,
    });

    // Mark job complete
    await updateJob(jobId, {
        status: 'complete',
        completed_at: new Date().toISOString(),
        video_storage_path: videoStoragePath,
        credits_deducted: totalCredits,
    });
    await appendLog(jobId, 'complete', `Pipeline complete! ${totalCredits} credits deducted.`);
}

// Calculate estimated credits
function calculateCredits(totalScenes) {
    return 9 + (totalScenes * 5);
}

module.exports = {
    runScriptGeneration,
    runAudioGeneration,
    runImagePromptGeneration,
    runImageGeneration,
    runStitching,
    completeJob,
    calculateCredits,
};
