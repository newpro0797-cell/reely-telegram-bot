const ffmpegStatic = require('ffmpeg-static');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

// Use the bundled ffmpeg binary from ffmpeg-static
ffmpeg.setFfmpegPath(ffmpegStatic);

function runFfmpeg(command) {
    return new Promise((resolve, reject) => {
        command
            .on('end', resolve)
            .on('error', reject)
            .run();
    });
}

/**
 * Create a video clip from a single image for a given duration.
 * Applies Ken Burns (zoompan) effect if enabled.
 */
async function createSceneClip({ imagePath, outputPath, duration, width, height, kenBurns, fps = 30 }) {
    const [w, h] = [parseInt(width), parseInt(height)];
    const totalFrames = Math.ceil(duration * fps);

    let command = ffmpeg()
        .input(imagePath)
        .inputOptions(['-loop', '1']);

    if (kenBurns) {
        command = command
            .outputOptions([
                `-vf`, `zoompan=z='min(zoom+0.001,1.05)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${w}x${h}:fps=${fps},format=yuv420p`,
                `-frames:v`, `${totalFrames}`,
            ]);
    } else {
        command = command.outputOptions([
            `-t`, `${duration}`,
            `-vf`, `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`,
            `-r`, `${fps}`,
        ]);
    }

    command = command
        .outputOptions([
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-preset', 'fast',
        ])
        .output(outputPath);

    await runFfmpeg(command);
}

/**
 * Main stitching function.
 * 1. Create per-scene clips with exact durations
 * 2. Concatenate clips into a silent video
 * 3. Merge with audio
 */
async function stitchVideo({
    runId,
    tmpDir,
    scenes,
    audioPath,
    outputPath,
    resolution = '1080x1920',
    crf = 23,
    kenBurns = true,
    transitionEffect = 'none',
    transitionDuration = 0.5,
}) {
    const [width, height] = resolution.split('x');
    const clipPaths = [];

    // Step 1: Create per-scene clips
    for (const scene of scenes) {
        const sceneNum = scene.scene_number;
        const imagePath = path.join(tmpDir, `scene_${sceneNum}.png`);
        const clipPath = path.join(tmpDir, `clip_${sceneNum}.mp4`);

        if (!fs.existsSync(imagePath)) {
            throw new Error(`Scene image not found: ${imagePath}`);
        }

        await createSceneClip({
            imagePath,
            outputPath: clipPath,
            duration: scene.display_duration_seconds,
            width,
            height,
            kenBurns,
        });

        clipPaths.push(clipPath);
    }

    let silentVideoPath;

    // Step 2: Apply transitions or simple concat
    if (transitionEffect !== 'none' && transitionEffect && clipPaths.length > 1) {
        silentVideoPath = path.join(tmpDir, 'silent_video.mp4');
        await concatWithTransitions({
            clipPaths,
            outputPath: silentVideoPath,
            transitionEffect,
            transitionDuration,
            crf,
        });
    } else {
        // Simple concat using concat demuxer
        const concatFilePath = path.join(tmpDir, 'concat.txt');
        const concatContent = clipPaths.map(p => `file '${p}'`).join('\n');
        fs.writeFileSync(concatFilePath, concatContent);

        silentVideoPath = path.join(tmpDir, 'silent_video.mp4');

        const concatCmd = ffmpeg()
            .input(concatFilePath)
            .inputOptions(['-f', 'concat', '-safe', '0'])
            .outputOptions([
                '-c:v', 'libx264',
                '-pix_fmt', 'yuv420p',
                '-crf', `${crf}`,
                '-preset', 'fast',
            ])
            .output(silentVideoPath);

        await runFfmpeg(concatCmd);
    }

    // Step 3: Merge audio
    const mergeCmd = ffmpeg()
        .input(silentVideoPath)
        .input(audioPath)
        .outputOptions([
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-shortest',
        ])
        .output(outputPath);

    await runFfmpeg(mergeCmd);
}

/**
 * Concatenate clips with xfade transitions between them.
 */
async function concatWithTransitions({ clipPaths, outputPath, transitionEffect, transitionDuration, crf }) {
    if (clipPaths.length === 1) {
        fs.copyFileSync(clipPaths[0], outputPath);
        return;
    }

    const xfadeMap = {
        'fade': 'fade',
        'slide_left': 'slideleft',
        'slide_right': 'slideright',
        'zoom_in': 'circlecrop',
        'zoom_out': 'circleopen',
    };

    const ffmpegTransition = xfadeMap[transitionEffect] || 'fade';

    // Build complex filter chain for xfade
    let command = ffmpeg();
    clipPaths.forEach(p => command.input(p));

    const filters = [];
    let prevOutput = '[0:v]';

    for (let i = 1; i < clipPaths.length; i++) {
        const offset = i * 5 - transitionDuration; // approximate offset
        const currentOutput = i === clipPaths.length - 1 ? 'outv' : `v${i}`;
        filters.push(
            `${prevOutput}[${i}:v]xfade=transition=${ffmpegTransition}:duration=${transitionDuration}:offset=${Math.max(0, offset)}[${currentOutput}]`
        );
        prevOutput = `[${currentOutput}]`;
    }

    command = command
        .complexFilter(filters)
        .outputOptions([
            '-map', '[outv]',
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-crf', `${crf}`,
            '-preset', 'fast',
        ])
        .output(outputPath);

    await runFfmpeg(command);
}

module.exports = { stitchVideo };
