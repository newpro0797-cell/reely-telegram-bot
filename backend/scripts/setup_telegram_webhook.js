require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function setupWebhook() {
    if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN === 'your-telegram-bot-token') {
        console.error('❌ Error: TELEGRAM_BOT_TOKEN is not set correctly in your .env file.');
        process.exit(1);
    }

    // Pass the webhook URL as an argument
    const webhookUrl = process.argv[2];

    if (!webhookUrl) {
        console.error('❌ Error: Please provide the webhook URL as an argument.');
        console.log('Usage: node setup_telegram_webhook.js <YOUR_PRODUCTION_DOMAIN>/api/telegram/webhook');
        process.exit(1);
    }

    const apiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`;

    try {
        console.log(`Setting Telegram Webhook to: ${webhookUrl}`);

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: webhookUrl,
                secret_token: process.env.TELEGRAM_SECRET_TOKEN || 'reely_telegram_secret'
            })
        });

        const data = await response.json();

        if (data.ok) {
            console.log('✅ Webhook configured successfully!');
            console.log(data);
        } else {
            console.error('❌ Failed to configure Webhook:');
            console.error(data);
        }
    } catch (error) {
        console.error('❌ Error connecting to Telegram API:', error);
    }
}

setupWebhook();
