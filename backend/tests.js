/**
 * Core Logic & Mock Integration Tests
 * Run with: node tests.js
 */

const assert = require('assert');

// --- 1. Core Logic Functions (Isolated for testing) ---
function parseDuration(textContent) {
    let target = 15;
    const match = textContent.match(/(\d+)\s*(sec|s|second(s?))/i);
    if (match) {
        target = parseInt(match[1], 10);
        target = Math.min(target, 45); // Max 45s constraint
    }
    return target;
}

function calculateNumImages(audioSeconds) {
    return Math.ceil(audioSeconds / 5);
}

// --- 2. Mock Pipeline Logic ---
async function runMockPipeline(userPrompt) {
    console.log(`\n[MOCK PIPELINE] Starting for prompt: "${userPrompt}"`);

    const targetDuration = parseDuration(userPrompt);
    console.log(`[MOCK PIPELINE] Target Duration: ${targetDuration}s`);

    // Mock Narration
    const narration = `This is a mocked 15-second narration about ${userPrompt}.`;
    console.log(`[MOCK PIPELINE] 1. Gemini Narration Generated`);

    // Mock Audio
    let audioDurationSeconds = targetDuration + 1.5; // Simulate slightly longer audio
    if (audioDurationSeconds > 45) audioDurationSeconds = 45; // Trim constraint
    console.log(`[MOCK PIPELINE] 2. Kokoro Audio: Length ${audioDurationSeconds}s`);

    // Mock Image Prompts
    const numImages = calculateNumImages(audioDurationSeconds);
    console.log(`[MOCK PIPELINE] 3. Gemini Props: Generating exactly ${numImages} prompts.`);

    // Mock ZImage Generation
    console.log(`[MOCK PIPELINE] 4. Z Image: Generated ${numImages} images in parallel.`);

    // Mock FFmpeg Stitching
    console.log(`[MOCK PIPELINE] 5. FFmpeg Stitching on Modal.`);
    const mockFileSizeMB = Math.random() > 0.5 ? 28 : 20; // 50% chance of being >25MB

    // Mock Size Check
    if (mockFileSizeMB > 25) {
        console.log(`[MOCK PIPELINE] 6. Compress: Video size is ${mockFileSizeMB}MB (>25MB). Compressing...`);
        console.log(`[MOCK PIPELINE] 6. Compress: Video size reduced to 22MB.`);
    } else {
        console.log(`[MOCK PIPELINE] 6. Compress: Video size is ${mockFileSizeMB}MB. No compression needed.`);
    }

    console.log(`[MOCK PIPELINE] 7. Uploaded to Supabase.`);
    console.log(`[MOCK PIPELINE] 8. Sent Telegram Message!`);
    return true;
}

// --- 3. Execute Tests ---
async function main() {
    try {
        console.log("Running Unit Tests...");

        // Duration tests
        assert.strictEqual(parseDuration("Make a motivational video"), 15, "Default to 15s");
        assert.strictEqual(parseDuration("Make a video 20 sec"), 20, "Parse 20s");
        assert.strictEqual(parseDuration("Make a video 100 seconds"), 45, "Clamp to 45s");

        // Math tests
        assert.strictEqual(calculateNumImages(15), 3, "15s = 3 images");
        assert.strictEqual(calculateNumImages(16), 4, "16s = 4 images");
        assert.strictEqual(calculateNumImages(45), 9, "45s = 9 images");

        console.log("✅ Unit Tests Passed!");

        console.log("\nRunning Integration Tests...");
        await runMockPipeline("Make a video about discipline. 18 seconds long.");

        console.log("\n✅ All Tests Passed Successfully!");
    } catch (e) {
        console.error("❌ Test Failed:", e);
        process.exit(1);
    }
}

main();
