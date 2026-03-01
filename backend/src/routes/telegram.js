const express = require('express');
const { supabaseAdmin } = require('../config/supabase');

const router = express.Router();

const TELEGRAM_SECRET_TOKEN = process.env.TELEGRAM_SECRET_TOKEN || 'reely_telegram_secret';

// Process Telegram Webhook (POST)
router.post('/webhook', async (req, res) => {
    // Validate secret token if we have one configured
    const secretToken = req.headers['x-telegram-bot-api-secret-token'];

    // In production you should strictly verify this, but for dev we might allow empty if not set
    if (process.env.NODE_ENV === 'production' && secretToken !== TELEGRAM_SECRET_TOKEN) {
        console.warn('Unauthorized Telegram Webhook attempt.');
        return res.status(403).send('Unauthorized');
    }

    // Acknowledge quickly
    res.status(200).send('OK');

    try {
        const update = req.body;

        // Handle incoming messages
        if (update.message && update.message.text) {
            await handleIncomingDM(update.message);
        }
    } catch (error) {
        console.error('Error processing Telegram webhook:', error);
    }
});

async function handleIncomingDM(message) {
    const senderId = message.chat.id.toString(); // Group or Private chat ID
    const messageId = message.message_id.toString();
    const textContent = message.text;

    console.log(`Processing inbound Telegram DM: ${messageId} from chat ${senderId}`);

    // Commands like /start
    if (textContent.startsWith('/start')) {
        await sendTelegramTextMessage(senderId, "Welcome to Reely AI! ✨\nJust send me a prompt and tell me how many seconds you want the video to be (e.g., '15s a relaxing ocean view').");
        return;
    }

    // Immediate confirmation of receipt
    await sendTelegramTextMessage(senderId, "Prompt received! Checking queue... ⏳");

    // 1. Insert into inbound_messages idempotently
    const { data: inboundMsg, error: insertError } = await supabaseAdmin
        .from('inbound_messages')
        .insert({
            platform_message_id: messageId,
            sender_id: senderId,
            conversation_id: senderId,
            text_content: textContent,
            status: 'pending'
        })
        .select()
        .single();

    if (insertError) {
        if (insertError.code === '23505') { // Unique violation
            console.log(`Message ${messageId} already processed (deduped).`);
            return;
        }
        console.error('Failed to insert inbound_message:', insertError);
        return;
    }

    // 2. Parse text for target duration (defaults to 15s)
    let targetDurationSeconds = 15;
    const durationMatch = textContent.match(/(\d+)\s*(sec|s|second(s?))/i);
    if (durationMatch) {
        targetDurationSeconds = parseInt(durationMatch[1], 10);
        targetDurationSeconds = Math.min(targetDurationSeconds, 45); // Max 45s constraint
    }

    // 3. Enqueue video job
    const { error: jobError } = await supabaseAdmin
        .from('video_jobs')
        .insert({
            message_id: inboundMsg.id,
            target_duration_seconds: targetDurationSeconds,
            status: 'queued'
        });

    if (jobError) {
        console.error('Failed to enqueue video_job:', jobError);
    } else {
        console.log(`Enqueued job for msg ${messageId}, target duration: ${targetDurationSeconds}s`);
        await sendTelegramTextMessage(senderId, "Got it — generating your video now... 🎬");
    }
}

async function sendTelegramTextMessage(chatId, text) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
        console.warn("[DryRun] Would send Telegram text:", text);
        return;
    }

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Telegram API error:", errorText);
        }
    } catch (e) {
        console.error("Failed to send Telegram ACK:", e);
    }
}

module.exports = router;
