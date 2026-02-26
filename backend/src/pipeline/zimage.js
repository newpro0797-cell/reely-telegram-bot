/**
 * Z-Image integration via Modal endpoint.
 * Uses server-side MODAL_ZIMAGE_ENDPOINT env var.
 * Response: { "image": "<base64_png>", "format": "png" }
 */

async function generateImage(prompt, width = 1080, height = 1920, steps = 9, guidanceScale = 0.0, seed = null) {
    const endpoint = process.env.MODAL_ZIMAGE_ENDPOINT;
    if (!endpoint) {
        throw new Error('MODAL_ZIMAGE_ENDPOINT is not configured on the server.');
    }

    const url = endpoint.replace(/\/$/, '') + '/generate';

    const body = {
        prompt,
        width,
        height,
        steps,
        guidance_scale: guidanceScale,
    };

    if (seed !== null) {
        body.seed = seed;
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Z-Image error (${response.status}): ${errText}`);
    }

    const data = await response.json();

    // IMPORTANT: Read from data.image, NOT data.image_b64
    if (!data.image) {
        throw new Error('Z-Image response missing "image" field');
    }

    return Buffer.from(data.image, 'base64');
}

module.exports = { generateImage };
