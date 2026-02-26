const { supabaseAdmin } = require('../config/supabase');

async function uploadToTemp(storagePath, buffer, contentType) {
    const { error } = await supabaseAdmin.storage
        .from('reely-temp')
        .upload(storagePath, buffer, {
            contentType,
            upsert: true,
        });

    if (error) throw new Error(`Storage upload error (reely-temp): ${error.message}`);
}

async function uploadToVideos(storagePath, buffer, contentType) {
    const { error } = await supabaseAdmin.storage
        .from('reely-videos')
        .upload(storagePath, buffer, {
            contentType,
            upsert: true,
        });

    if (error) throw new Error(`Storage upload error (reely-videos): ${error.message}`);
}

async function downloadFromTemp(storagePath) {
    const { data, error } = await supabaseAdmin.storage
        .from('reely-temp')
        .download(storagePath);

    if (error) throw new Error(`Storage download error: ${error.message}`);
    return Buffer.from(await data.arrayBuffer());
}

async function cleanupTemp(userId, runId) {
    try {
        const prefix = `${userId}/${runId}/`;
        const { data: files } = await supabaseAdmin.storage
            .from('reely-temp')
            .list(`${userId}/${runId}`);

        if (files && files.length > 0) {
            const paths = files.map(f => `${prefix}${f.name}`);
            await supabaseAdmin.storage.from('reely-temp').remove(paths);
        }
    } catch (err) {
        console.error('[Cleanup Warning]', err.message);
    }
}

module.exports = { uploadToTemp, uploadToVideos, downloadFromTemp, cleanupTemp };
