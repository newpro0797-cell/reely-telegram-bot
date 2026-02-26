import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabaseAdmin } from './supabase.js';

// ============= HELPERS =============

export async function updateJob(jobId, updates) {
    const { error } = await supabaseAdmin
        .from('reel_jobs')
        .update(updates)
        .eq('id', jobId);
    if (error) console.error('[updateJob Error]', error.message);
}

export async function appendLog(jobId, stage, message) {
    const { data } = await supabaseAdmin
        .from('reel_jobs')
        .select('log_json')
        .eq('id', jobId)
        .single();

    const log = data?.log_json || { stages: [] };
    log.stages.push({ stage, message, timestamp: new Date().toISOString() });
    await updateJob(jobId, { log_json: log });
}

// ============= GEMINI =============

const SCRIPT_SYSTEM = `You are a video script writer for Instagram Reels. Write an engaging, natural narration script for a short vertical video based on the user's prompt.
The script must be suitable for text-to-speech and 15–90 seconds when spoken at normal pace (roughly 2.5 words per second).
Return only a JSON object:
{ "video_title": "...", "narration_script": "..." }
Do not include segment markers, pauses, [music], or any markup.
Write conversational, engaging language suitable for Gen Z audience.`;

const SCENE_SYSTEM = `Given this narration script and scene count, generate one cinematic image prompt per scene that visually tells the story in sequence. Return JSON:
{ "scenes": [ { "scene_number": N, "image_prompt": "...", "narration_segment": "..." }, ... ] }
Style: photorealistic, vertical 9:16, cinematic lighting, Instagram-quality.
Every prompt must be unique and describe a specific visual moment.`;

function safeParseJSON(text) {
    let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    try { return JSON.parse(cleaned); } catch (_) { }
    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
    try { return JSON.parse(cleaned); } catch (_) { }
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
        try { return JSON.parse(objMatch[0]); } catch (_) { }
    }
    throw new Error('Failed to parse Gemini response as JSON');
}

export async function generateScript(prompt) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

    const genAI = new GoogleGenerativeAI(apiKey);
    const genModel = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: SCRIPT_SYSTEM,
    });

    const result = await genModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
        },
    });

    const parsed = safeParseJSON(result.response.text());
    if (!parsed.video_title || !parsed.narration_script) {
        throw new Error('Gemini did not return expected script format');
    }
    return parsed;
}

export async function generateScenePrompts(narrationScript, totalScenes) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

    const genAI = new GoogleGenerativeAI(apiKey);
    const genModel = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: SCENE_SYSTEM,
    });

    const result = await genModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: `Narration script: "${narrationScript}"\nTotal scenes: ${totalScenes}.\nGenerate exactly ${totalScenes} scene image prompts.` }] }],
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
        },
    });

    const parsed = safeParseJSON(result.response.text());
    if (!parsed.scenes || !Array.isArray(parsed.scenes)) {
        throw new Error('Gemini did not return expected scene format');
    }
    return parsed;
}

// ============= KOKORO TTS =============

export async function generateAudio(text, voice = 'af_heart', speed = 1.0) {
    const endpoint = process.env.MODAL_KOKORO_ENDPOINT;
    if (!endpoint) throw new Error('MODAL_KOKORO_ENDPOINT not configured');

    const url = endpoint.replace(/\/$/, '') + '/generate';
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice, speed }),
    });

    if (!response.ok) {
        throw new Error(`Kokoro TTS error (${response.status}): ${await response.text()}`);
    }

    const data = await response.json();
    if (!data.audio) throw new Error('Kokoro TTS response missing "audio" field');

    return {
        audioBuffer: Buffer.from(data.audio, 'base64'),
        durationSeconds: data.duration_seconds,
    };
}

// ============= Z-IMAGE =============

export async function generateImage(prompt, width = 1080, height = 1920, steps = 9, guidanceScale = 0.0, seed = null) {
    const endpoint = process.env.MODAL_ZIMAGE_ENDPOINT;
    if (!endpoint) throw new Error('MODAL_ZIMAGE_ENDPOINT not configured');

    const url = endpoint.replace(/\/$/, '') + '/generate';
    const body = { prompt, width, height, steps, guidance_scale: guidanceScale };
    if (seed !== null) body.seed = seed;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        throw new Error(`Z-Image error (${response.status}): ${await response.text()}`);
    }

    const data = await response.json();
    if (!data.image) throw new Error('Z-Image response missing "image" field');
    return Buffer.from(data.image, 'base64');
}

// ============= STORAGE =============

export async function uploadToTemp(path, buffer, contentType) {
    const { error } = await supabaseAdmin.storage
        .from('reely-temp')
        .upload(path, buffer, { contentType, upsert: true });
    if (error) throw new Error(`Storage upload temp: ${error.message}`);
}

export async function uploadToVideos(path, buffer, contentType) {
    const { error } = await supabaseAdmin.storage
        .from('reely-videos')
        .upload(path, buffer, { contentType, upsert: true });
    if (error) throw new Error(`Storage upload videos: ${error.message}`);
}

export async function downloadFromTemp(storagePath) {
    const { data, error } = await supabaseAdmin.storage
        .from('reely-temp')
        .download(storagePath);
    if (error) throw new Error(`Storage download error: ${error.message}`);
    return Buffer.from(await data.arrayBuffer());
}

export async function cleanupTemp(userId, jobId) {
    try {
        const { data: files } = await supabaseAdmin.storage
            .from('reely-temp')
            .list(`${userId}/${jobId}`);
        if (files && files.length > 0) {
            const paths = files.map(f => `${userId}/${jobId}/${f.name}`);
            await supabaseAdmin.storage.from('reely-temp').remove(paths);
        }
    } catch (err) {
        console.error('[Cleanup Warning]', err.message);
    }
}

// ============= CREDIT CALCULATION =============

export function calculateCredits(totalScenes) {
    return 9 + (totalScenes * 5);
}

// ============= STEP-BY-STEP PIPELINE =============

export async function runScriptGeneration(jobId, prompt) {
    try {
        await updateJob(jobId, { status: 'generating_script' });
        await appendLog(jobId, 'script_generation', 'Generating narration script...');

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

export async function runAudioGeneration(jobId) {
    try {
        const { data: job } = await supabaseAdmin
            .from('reel_jobs')
            .select('narration_script, user_id')
            .eq('id', jobId)
            .single();

        if (!job) throw new Error('Job not found');

        await updateJob(jobId, { status: 'generating_audio' });
        await appendLog(jobId, 'audio_generation', 'Generating voiceover...');

        const audioResult = await generateAudio(job.narration_script);
        const audioStoragePath = `${job.user_id}/${jobId}/audio.wav`;
        await uploadToTemp(audioStoragePath, audioResult.audioBuffer, 'audio/wav');

        const totalScenes = Math.ceil(audioResult.durationSeconds / 5);

        await updateJob(jobId, {
            audio_duration_seconds: audioResult.durationSeconds,
            total_scenes: totalScenes,
            status: 'generating_image_prompts',
        });
        await appendLog(jobId, 'audio_generation', `Audio: ${audioResult.durationSeconds}s, ${totalScenes} scenes`);

        return { durationSeconds: audioResult.durationSeconds, totalScenes };
    } catch (err) {
        await updateJob(jobId, { status: 'failed', error_message: err.message });
        throw err;
    }
}

export async function runImagePromptGeneration(jobId) {
    try {
        const { data: job } = await supabaseAdmin
            .from('reel_jobs')
            .select('narration_script, total_scenes, audio_duration_seconds, user_id')
            .eq('id', jobId)
            .single();

        if (!job) throw new Error('Job not found');

        await appendLog(jobId, 'image_prompts', 'Generating scene prompts...');

        const scenePrompts = await generateScenePrompts(job.narration_script, job.total_scenes);

        const scenes = scenePrompts.scenes.map((scene, idx) => {
            const sceneNum = idx + 1;
            const duration = sceneNum < job.total_scenes ? 5.0 : job.audio_duration_seconds - (job.total_scenes - 1) * 5.0;
            return { ...scene, scene_number: sceneNum, display_duration_seconds: duration };
        });

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
        throw err;
    }
}

export async function runImageGeneration(jobId, singleSceneNum = null) {
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

        let query = supabaseAdmin
            .from('reel_scenes')
            .select('*')
            .eq('job_id', jobId)
            .order('scene_number', { ascending: true });

        if (singleSceneNum) query = query.eq('scene_number', singleSceneNum);

        const { data: scenes } = await query;
        if (!scenes || scenes.length === 0) throw new Error('No scenes found');

        const results = await Promise.all(scenes.map(async (scene) => {
            const sceneNum = scene.scene_number;
            try {
                const imageBuffer = await generateImage(scene.image_prompt, 1080, 1920, 9, 0.0, null);
                const imgStoragePath = `${job.user_id}/${jobId}/scene_${sceneNum}.png`;
                await uploadToTemp(imgStoragePath, imageBuffer, 'image/png');

                await supabaseAdmin.from('reel_scenes')
                    .update({ status: 'complete', image_storage_path: imgStoragePath })
                    .eq('job_id', jobId)
                    .eq('scene_number', sceneNum);

                await appendLog(jobId, 'image_generation', `Scene ${sceneNum} complete`);
                return { sceneNum, success: true };
            } catch (err) {
                await supabaseAdmin.from('reel_scenes')
                    .update({ status: 'failed' })
                    .eq('job_id', jobId)
                    .eq('scene_number', sceneNum);
                return { sceneNum, success: false, error: err.message };
            }
        }));

        const allComplete = results.every(r => r.success);
        if (allComplete || singleSceneNum) {
            await updateJob(jobId, { status: 'awaiting_style_selection' });
        }

        return results;
    } catch (err) {
        await updateJob(jobId, { status: 'failed', error_message: err.message });
        throw err;
    }
}

export async function runStitchingViaModal(jobId, options = {}) {
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
        await appendLog(jobId, 'stitching', 'Stitching video...');

        const { data: scenes } = await supabaseAdmin
            .from('reel_scenes')
            .select('*')
            .eq('job_id', jobId)
            .eq('status', 'complete')
            .order('scene_number', { ascending: true });

        if (!scenes || scenes.length === 0) throw new Error('No completed scenes');

        // Download images and audio
        const sceneData = [];
        for (const scene of scenes) {
            const imgBuffer = await downloadFromTemp(scene.image_storage_path);
            sceneData.push({
                scene_number: scene.scene_number,
                image_base64: imgBuffer.toString('base64'),
                display_duration_seconds: scene.display_duration_seconds,
            });
        }

        const audioStoragePath = `${job.user_id}/${jobId}/audio.wav`;
        const audioBuffer = await downloadFromTemp(audioStoragePath);

        const aspectRatio = options.aspectRatio || job.video_aspect_ratio || '9:16';
        let resolution = '1080x1920';
        if (aspectRatio === '1:1') resolution = '1080x1080';
        else if (aspectRatio === '16:9') resolution = '1920x1080';

        const ffmpegEndpoint = process.env.MODAL_FFMPEG_ENDPOINT;
        if (!ffmpegEndpoint) throw new Error('MODAL_FFMPEG_ENDPOINT not configured for Vercel');

        const url = ffmpegEndpoint.replace(/\/$/, '') + '/stitch';
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                scenes: sceneData,
                audio_base64: audioBuffer.toString('base64'),
                resolution,
                crf: 23,
                ken_burns: (options.animation || job.selected_animation || 'ken_burns') === 'ken_burns',
                transition_effect: options.transition || job.selected_transition || 'fade',
                transition_duration: 0.5,
            }),
        });

        if (!response.ok) throw new Error(`FFmpeg error: ${await response.text()}`);
        const data = await response.json();
        if (!data.video) throw new Error('FFmpeg response missing "video" field');

        const videoBuffer = Buffer.from(data.video, 'base64');
        const videoStoragePath = `${job.user_id}/${jobId}/final.mp4`;
        await uploadToVideos(videoStoragePath, videoBuffer, 'video/mp4');

        await cleanupTemp(job.user_id, jobId);

        // Deduct credits
        const totalCredits = calculateCredits(job.total_scenes);
        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('credits, total_videos_created')
            .eq('id', job.user_id)
            .single();

        if (profile) {
            const creditsAfter = profile.credits - totalCredits;
            await supabaseAdmin.from('profiles').update({
                credits: creditsAfter,
                total_videos_created: (profile.total_videos_created || 0) + 1,
            }).eq('id', job.user_id);

            await supabaseAdmin.from('credit_transactions').insert({
                user_id: job.user_id,
                job_id: jobId,
                type: 'video_creation',
                credits_before: profile.credits,
                credits_change: -totalCredits,
                credits_after: creditsAfter,
                description: `Video creation — ${totalCredits} credits`,
            });
        }

        await updateJob(jobId, {
            status: 'complete',
            completed_at: new Date().toISOString(),
            video_storage_path: videoStoragePath,
            credits_deducted: totalCredits,
        });
        await appendLog(jobId, 'complete', 'Pipeline complete!');

        return { videoStoragePath, creditsDeducted: totalCredits };
    } catch (err) {
        await updateJob(jobId, { status: 'failed', error_message: err.message });
        await appendLog(jobId, 'stitching', `Error: ${err.message}`);
        throw err;
    }
}
