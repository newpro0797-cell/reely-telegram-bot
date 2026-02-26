/**
 * Kokoro TTS integration via Modal endpoint.
 * Uses server-side MODAL_KOKORO_ENDPOINT env var.
 * Response: { "audio": "<base64_wav>", "duration_seconds": <float>, "format": "wav" }
 */

async function generateAudio(text, voice = 'af_heart', speed = 1.0) {
    const endpoint = process.env.MODAL_KOKORO_ENDPOINT;
    if (!endpoint) {
        throw new Error('MODAL_KOKORO_ENDPOINT is not configured on the server.');
    }

    const url = endpoint.replace(/\/$/, '') + '/generate';

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice, speed }),
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Kokoro TTS error (${response.status}): ${errText}`);
    }

    const data = await response.json();

    // IMPORTANT: Read from data.audio, NOT data.audio_b64
    if (!data.audio) {
        throw new Error('Kokoro TTS response missing "audio" field');
    }

    const audioBuffer = Buffer.from(data.audio, 'base64');
    const durationSeconds = data.duration_seconds;

    if (!durationSeconds || durationSeconds <= 0) {
        throw new Error('Kokoro TTS returned invalid duration');
    }

    return { audioBuffer, durationSeconds };
}

module.exports = { generateAudio };
