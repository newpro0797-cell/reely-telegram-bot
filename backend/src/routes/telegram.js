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
        } else if (update.callback_query) {
            await handleCallbackQuery(update.callback_query);
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

    // Send options to the user
    await sendTelegramTextMessage(senderId, "Prompt received! How would you like to proceed?", {
        inline_keyboard: [
            [
                { text: "Use This Prompt", callback_data: `use_${inboundMsg.id}` },
                { text: "Optimize Prompt", callback_data: `opt_${inboundMsg.id}` }
            ]
        ]
    });
}

async function handleCallbackQuery(callbackQuery) {
    const senderId = callbackQuery.message.chat.id.toString();
    const callbackData = callbackQuery.data;
    const queryId = callbackQuery.id;

    console.log(`Processing Telegram callback: ${callbackData} from chat ${senderId}`);

    // Acknowledge the callback query so the button stops showing a loading state
    await answerCallbackQuery(queryId);

    if (callbackData.startsWith('use_')) {
        const inboundMsgId = callbackData.replace('use_', '');
        await enqueueVideoJob(inboundMsgId, senderId);
    } else if (callbackData.startsWith('opt_')) {
        const inboundMsgId = callbackData.replace('opt_', '');
        await processPromptOptimization(inboundMsgId, senderId);
    }
}

async function processPromptOptimization(inboundMsgId, senderId) {
    // 1. Fetch the original message
    const { data: originalMsg, error: fetchError } = await supabaseAdmin
        .from('inbound_messages')
        .select('*')
        .eq('id', inboundMsgId)
        .single();

    if (fetchError || !originalMsg) {
        console.error('Failed to fetch original message for optimization:', fetchError);
        await sendTelegramTextMessage(senderId, "Sorry, I couldn't find the original prompt. Please send it again.");
        return;
    }

    // Let the user know we're working on it
    await sendTelegramTextMessage(senderId, "Optimizing your prompt using AI... 🪄");

    try {
        const { optimizePrompt } = require('../pipeline/gemini');
        const optimizedText = await optimizePrompt(originalMsg.text_content);

        // Insert new optimized message
        const { data: newInboundMsg, error: insertError } = await supabaseAdmin
            .from('inbound_messages')
            .insert({
                platform_message_id: originalMsg.platform_message_id + '_opt', // Modified to avoid unique constraint if retried
                sender_id: senderId,
                conversation_id: senderId,
                text_content: optimizedText,
                status: 'pending'
            })
            .select()
            .single();

        if (insertError) {
            console.error('Failed to insert optimized inbound_message:', insertError);
            await sendTelegramTextMessage(senderId, "Sorry, there was an error saving your optimized prompt.");
            return;
        }

        // Convert Gemini's basic markdown (**bold**, *italic*) to HTML for Telegram
        let formattedText = optimizedText
            .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>') // Bold
            .replace(/\*(.*?)\*/g, '<i>$1</i>');    // Italic

        // Send optimized prompt and approve button
        await sendTelegramTextMessage(senderId, `Here is the optimized prompt:\n\n${formattedText}`, {
            inline_keyboard: [
                [
                    { text: "Approve \u2705", callback_data: `use_${newInboundMsg.id}` }
                ]
            ]
        }, 'HTML');

    } catch (error) {
        console.error('Error optimizing prompt:', error);
        await sendTelegramTextMessage(senderId, "Sorry, there was an error optimizing your prompt.");
    }
}


async function enqueueVideoJob(inboundMsgId, senderId) {
    // 1. Fetch the message
    const { data: inboundMsg, error: fetchError } = await supabaseAdmin
        .from('inbound_messages')
        .select('*')
        .eq('id', inboundMsgId)
        .single();

    if (fetchError || !inboundMsg) {
        console.error('Failed to fetch message for job queuing:', fetchError);
        await sendTelegramTextMessage(senderId, "Sorry, I couldn't find your prompt in the system.");
        return;
    }

    // 2. Parse text for target duration (defaults to 15s)
    let targetDurationSeconds = 15;
    const durationMatch = inboundMsg.text_content.match(/(\d+)\s*(sec|s|second(s?))/i);
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
        await sendTelegramTextMessage(senderId, "Sorry, there was an error adding your video to the queue.");
    } else {
        console.log(`Enqueued job for msg ${inboundMsgId}, target duration: ${targetDurationSeconds}s`);
        await sendTelegramTextMessage(senderId, "Got it — generating your video now... 🎬");
    }
}

async function sendTelegramTextMessage(chatId, text, replyMarkup = null, parseMode = null) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
        console.warn("[DryRun] Would send Telegram text:", text);
        return;
    }

    const payload = {
        chat_id: chatId,
        text: text
    };

    if (replyMarkup) {
        payload.reply_markup = replyMarkup;
    }

    if (parseMode) {
        payload.parse_mode = parseMode;
    }

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Telegram API error:", errorText);
        }
    } catch (e) {
        console.error("Failed to send Telegram message:", e);
    }
}

async function answerCallbackQuery(callbackQueryId) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return;

    const url = `https://api.telegram.org/bot${botToken}/answerCallbackQuery`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callback_query_id: callbackQueryId })
        });
    } catch (e) {
        console.error("Failed to answer callback query:", e);
    }
}

module.exports = router;
