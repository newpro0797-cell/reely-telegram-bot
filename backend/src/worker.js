const { supabaseAdmin } = require('./config/supabase');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Helpers for the pipeline
const kokoro = require('./pipeline/kokoro');
const zimage = require('./pipeline/zimage');

// Environment variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MODAL_FFMPEG_ENDPOINT = process.env.MODAL_FFMPEG_ENDPOINT;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Helper to log events to Supabase
async function logEvent(jobId, eventType, details = {}) {
    await supabaseAdmin.from('job_events').insert({
        job_id: jobId,
        event_type: eventType,
        details
    });
    console.log(`[Job ${jobId}] ${eventType}`, details);
}

// Update job status safely
async function updateJobStatus(jobId, status, payload = {}) {
    await supabaseAdmin.from('video_jobs').update({ status, ...payload }).eq('id', jobId);
    await logEvent(jobId, `status_changed_to_${status}`);
}

// 1. Narration prompt
async function generateNarration(userPrompt, targetDuration) {
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: 'You are a professional short-form video script writer. Create a safe, PG-13 narration for text-to-speech. No markdown. No lists. No scene directions.'
    });

    const promptText = `Prompt: ${userPrompt}\nTarget duration: ${targetDuration}s (max 45s)\nRules:\n- Match the target duration closely.\n- Use ~2.2 to 2.6 words/second as a guide.\n- Keep it punchy and natural for TTS.\n- Avoid disallowed or explicit content.\nReturn ONLY the narration text.`;

    const result = await model.generateContent(promptText);
    return result.response.text().trim();
}

// 2. Image Prompts
async function generateImagePrompts(userPrompt, narration, audioSeconds, numImages) {
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: 'You are an expert text-to-image prompt writer for a consistent visual story. Output valid JSON only.'
    });

    const promptText = `Original prompt: ${userPrompt}\nNarration: ${narration}\nAudio length: ${audioSeconds}s\nWe need exactly ${numImages} images. 1 image covers ~5 seconds.\nStyle constraints:\n- Vertical 9:16 composition.\n- Consistent style across all images (define a cohesive style and stick to it).\n- Each image should reflect the story progression.\nOutput format:\n{ "style_guide": "...", "images": [ { "index": 1, "prompt": "..." } ] }\nReturn JSON ONLY. EXACTLY ${numImages} entries in "images".`;

    const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: promptText }] }],
        generationConfig: { responseMimeType: 'application/json' }
    });

    return JSON.parse(result.response.text());
}

// 3. Retry wrapper for external API calls
async function retry(fn, retries = 3, backoff = 1000) {
    for (let i = 0; i < retries; i++) {
        try { return await fn(); }
        catch (err) {
            if (i === retries - 1) throw err;
            await new Promise(r => setTimeout(r, backoff * Math.pow(2, i)));
        }
    }
}

// Worker loop
async function processNextJob() {
    // Check for a queued job
    const { data: job, error } = await supabaseAdmin
        .from('video_jobs')
        .select('*, inbound_messages(*)')
        .eq('status', 'queued')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error('Error fetching jobs:', error);
        return;
    }

    if (!job) return; // No jobs

    const jobId = job.id;
    const messageId = job.message_id;
    const userPrompt = job.inbound_messages.text_content;
    const senderId = job.inbound_messages.sender_id;
    const maxDuration = Math.min((job.target_duration_seconds || 15), 45);

    try {
        await updateJobStatus(jobId, 'generating_narration');
        await sendTelegramTextMessage(senderId, "📝 Writing narration script...");

        // 1. Narration
        const narration = await retry(() => generateNarration(userPrompt, maxDuration));
        await updateJobStatus(jobId, 'generating_audio', { narration_text: narration });
        await sendTelegramTextMessage(senderId, "🗣️ Recording AI voiceover...");

        // 2. Audio
        let { audioBuffer, durationSeconds } = await retry(() => kokoro.generateAudio(narration));
        if (durationSeconds > 45) {
            // Trim audio logic - implemented via Modal ffmpeg in real scenario, but simplified bounds checking here initially
            durationSeconds = 45;
        }
        const audioBase64 = audioBuffer.toString('base64');

        // Calculate num_images
        const numImages = Math.ceil(durationSeconds / 5);
        await updateJobStatus(jobId, 'generating_image_prompts', { audio_duration_seconds: durationSeconds });
        await sendTelegramTextMessage(senderId, "🎨 Planning scenes and generating images...");

        // 3. Image Prompts
        const promptsObj = await retry(() => generateImagePrompts(userPrompt, narration, durationSeconds, numImages));
        const imagePrompts = promptsObj.images;
        await updateJobStatus(jobId, 'generating_images', { image_prompts: promptsObj });

        // 4. Parallel Image Generation
        const scenes = [];
        const imagePromises = imagePrompts.map(async (img, idx) => {
            // display duration is 5s usually, except the last one which trims to fit
            const isLast = idx === imagePrompts.length - 1;
            const remainingAudio = durationSeconds - (idx * 5);
            const displayDuration = isLast ? remainingAudio : 5.0;

            const imageBuffer = await retry(() => zimage.generateImage(img.prompt, 720, 1280));
            scenes.push({
                scene_number: img.index || (idx + 1),
                image_base64: imageBuffer.toString('base64'),
                display_duration_seconds: displayDuration
            });
        });
        await Promise.all(imagePromises);

        // Sort scenes just in case
        scenes.sort((a, b) => a.scene_number - b.scene_number);

        await updateJobStatus(jobId, 'stitching');
        await sendTelegramTextMessage(senderId, "🎞️ Stitching video and adding effects...");

        // 5. Stitching
        if (!MODAL_FFMPEG_ENDPOINT) throw new Error("MODAL_FFMPEG_ENDPOINT missing for stitching");
        const fetchVideo = await fetch(`${MODAL_FFMPEG_ENDPOINT}/stitch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                scenes,
                audio_base64: audioBase64,
                resolution: '720x1280',
                crf: 28, // conservative bitrate
                ken_burns: true,
                transition_effect: 'none'
            })
        });

        if (!fetchVideo.ok) throw new Error("Stitching failed: " + await fetchVideo.text());
        const stitchRes = await fetchVideo.json();
        let videoBuffer = Buffer.from(stitchRes.video, 'base64');

        // 6. Compression Check
        await updateJobStatus(jobId, 'compressing');
        if (videoBuffer.length > 25 * 1024 * 1024) {
            console.log(`Video too large (${videoBuffer.length} bytes), compressing...`);
            const compressReq = await fetch(`${MODAL_FFMPEG_ENDPOINT}/compress`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ video_base64: videoBuffer.toString('base64') })
            });
            if (!compressReq.ok) throw new Error("Compression failed: " + await compressReq.text());
            const compressRes = await compressReq.json();
            videoBuffer = Buffer.from(compressRes.video, 'base64');

            if (videoBuffer.length > 25 * 1024 * 1024) {
                throw new Error("Video still too large after compression!");
            }
        }

        // 7. Upload
        await updateJobStatus(jobId, 'uploading');
        await sendTelegramTextMessage(senderId, "🚀 Finalizing and uploading your video...");
        const filename = `${jobId}.mp4`;
        const { error: uploadError } = await supabaseAdmin.storage
            .from('ig-automated-videos')
            .upload(filename, videoBuffer, { contentType: 'video/mp4', upsert: true });

        if (uploadError) throw new Error("Supabase Upload Error: " + uploadError.message);

        // Get public URL
        const { data: publicUrlData } = supabaseAdmin.storage
            .from('ig-automated-videos')
            .getPublicUrl(filename);

        const storedUrl = publicUrlData.publicUrl;

        // 8. Telegram DM Reply
        await updateJobStatus(jobId, 'sending_dm', { video_storage_url: storedUrl });
        await sendTelegramVideoMessage(senderId, storedUrl);

        // mark complete
        await updateJobStatus(jobId, 'complete');

    } catch (e) {
        console.error(`Job ${jobId} failed:`, e);
        await updateJobStatus(jobId, 'failed', { error_message: e.message });
        await sendTelegramTextMessage(senderId, "Sorry, your video request failed: " + e.message);
    }
}

// Polling loop
function startWorker() {
    console.log("Worker loop started...");
    setInterval(async () => {
        try {
            await processNextJob();
        } catch (e) {
            console.error("Worker generic error:", e);
        }
    }, 5000);
}

// Telegram sends helper
async function sendTelegramTextMessage(chatId, text) {
    if (!TELEGRAM_BOT_TOKEN) return console.log("[DryRun] Send Text:", text);
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text })
        });
    } catch (e) {
        console.error("Failed to send Telegram text:", e);
    }
}

async function sendTelegramVideoMessage(chatId, videoUrl) {
    if (!TELEGRAM_BOT_TOKEN) return console.log("[DryRun] Send Video:", videoUrl);
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVideo`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, video: videoUrl })
        });
    } catch (e) {
        console.error("Failed to send Telegram video:", e);
    }
}

// Start immediately if file is run directly
if (require.main === module) {
    startWorker();
}

module.exports = { startWorker };
