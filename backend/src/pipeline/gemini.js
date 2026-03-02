const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Robustly parse JSON from Gemini responses.
 */
function safeParseJSON(text) {
    let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    try { return JSON.parse(cleaned); } catch (_) { }

    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
    cleaned = cleaned.replace(/([{,]\s*)'([^']+)'\s*:/g, '$1"$2":');
    cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, (c) => c === '\n' || c === '\t' ? c : '');
    try { return JSON.parse(cleaned); } catch (_) { }

    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
        try { return JSON.parse(objMatch[0]); } catch (_) { }
    }

    throw new Error('Failed to parse Gemini response as JSON. Raw: ' + text.substring(0, 200));
}

const SCRIPT_SYSTEM_INSTRUCTION = `You are a video script writer for Telegram Videos. Write an engaging, natural narration script for a short vertical video based on the user's prompt.
The script must be suitable for text-to-speech and 15–90 seconds when spoken at normal pace (roughly 2.5 words per second).
Return only a JSON object:
{ "video_title": "...", "narration_script": "..." }
Do not include segment markers, pauses, [music], or any markup.
Write conversational, engaging language suitable for Gen Z audience.`;

const SCENE_SYSTEM_INSTRUCTION = `Given this narration script and scene count, generate one cinematic image prompt per scene that visually tells the story in sequence. Return JSON:
{ "scenes": [ { "scene_number": N, "image_prompt": "...", "narration_segment": "..." }, ... ] }
Style: photorealistic, vertical 9:16, cinematic lighting, high-quality.
Every prompt must be unique and describe a specific visual moment. All prompts must be different from each other.`;

const OPTIMIZE_PROMPT_SYSTEM_INSTRUCTION = `You are an expert video producer and prompt engineer. Your task is to take a user's short idea for a vertical video and optimize it into a detailed, highly descriptive prompt suitable for generating a narration script and image prompts.
Analyze the user's idea and expand on it, adding vivid imagery, emotional tone, and specific visual details while maintaining the core concept.
Return ONLY the optimized prompt text. Do not include any explanations, JSON formatting, or conversational text.`;

async function generateScript(userPrompt) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.length < 10) {
        throw new Error('GEMINI_API_KEY is not configured on the server.');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const genModel = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: SCRIPT_SYSTEM_INSTRUCTION,
    });

    const result = await genModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
        },
    });

    const responseText = result.response.text();
    const parsed = safeParseJSON(responseText);

    if (!parsed.video_title || !parsed.narration_script) {
        throw new Error('Gemini did not return expected script format');
    }

    return {
        video_title: parsed.video_title,
        narration_script: parsed.narration_script,
    };
}

async function generateScenePrompts(narrationScript, totalScenes) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.length < 10) {
        throw new Error('GEMINI_API_KEY is not configured on the server.');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const genModel = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: SCENE_SYSTEM_INSTRUCTION,
    });

    const prompt = `Narration script: "${narrationScript}"
Total scenes: ${totalScenes}.
Generate exactly ${totalScenes} scene image prompts.`;

    const result = await genModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
        },
    });

    const responseText = result.response.text();
    const parsed = safeParseJSON(responseText);

    if (!parsed.scenes || !Array.isArray(parsed.scenes)) {
        throw new Error('Gemini did not return expected scene format');
    }

    return parsed;
}

async function optimizePrompt(userPrompt) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.length < 10) {
        throw new Error('GEMINI_API_KEY is not configured on the server.');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const genModel = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: OPTIMIZE_PROMPT_SYSTEM_INSTRUCTION,
    });

    const result = await genModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024,
        },
    });

    const responseText = result.response.text();
    return responseText.trim();
}

module.exports = { generateScript, generateScenePrompts, optimizePrompt };
