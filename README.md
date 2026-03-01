# Reely Instagram Automation

Reely has been refactored into a single-purpose automation system that converts Instagram Direct Messages into fully produced AI video responses.

## Architecture & Data Flow

1. **Webhook Ingestion**: Instagram pushes DMs to `/api/instagram/webhook`. 
2. **Idempotency**: Message IDs are tracked in `inbound_messages` (Supabase). Duplicates are skipped. 
3. **Queueing**: A job is created in the `video_jobs` table. The user is instantly sent a DM acknowledgment.
4. **Worker Orchestration**: A background node worker (`backend/src/worker.js`) polls for queued jobs.
5. **Generative Pipeline**:
   - **Gemini**: Generates a narration script targeting the user's requested duration (max 45s, default 15s).
   - **Kokoro TTS (Modal)**: Generates the audio voiceover. Audio length is strictly measured.
   - **Gemini**: Dynamically computes `num_images = ceil(audio_length / 5)` and writes prompts.
   - **ZImage (Modal)**: Generates images in parallel.
   - **FFmpeg Stitching (Modal CPU)**: Combines audio and images into MP4. Downsizes and re-encodes if file is `> 25 MB`.
6. **Delivery**: The final `< 25MB` video is uploaded to Supabase Storage and sent back as a video DM to the user.

## Environment Variables

### Backend (`.env`)
```
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# Generative AI APIs
GEMINI_API_KEY=...
MODAL_ZIMAGE_ENDPOINT=...
MODAL_KOKORO_ENDPOINT=...

# Modal FFmpeg Stitcher Endpoint
MODAL_FFMPEG_ENDPOINT=...

# Instagram Graph API
IG_ACCESS_TOKEN=...
IG_VERIFY_TOKEN=your_custom_webhook_secret
IG_APP_SECRET=your_facebook_app_secret
```

### Frontend (`.env`)
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## Deployment & Configuration

### 1. Database Migrations
Run the Supabase SQL commands found in `backend/supabase/migration_v3.sql` to prepare the database schema for automation logging and queues.

### 2. Modal Deployments
The heavy generic compute (TTS, image generation, and FFmpeg) runs on Modal.
To deploy the new FFmpeg CPU Stitcher with compression support:
```bash
cd modal
python3 -m modal deploy ffmpeg_stitcher.py
```
> Copy the resulting REST URL and set it as `MODAL_FFMPEG_ENDPOINT` in your `.env`.

### 3. Backend Worker
Ensure your Node backend is constantly running. The backend acts as the HTTP webhook receiver and also spins up a background poller inside `backend/src/worker.js`.
```bash
cd backend
npm install
npm run start
```

### 4. Instagram Webhook Configuration
- Go to Meta for Developers -> App Dashboard -> Webhooks.
- Create a webhook subscription for `messages` underneath the Instagram object.
- Provide the Callback URL: `https://your-domain.com/api/instagram/webhook`
- Verify Token: Matches `IG_VERIFY_TOKEN` in your `.env`.

## Development & Testing

A simulated IG webhook trigger allows you to test the entire state machine end-to-end exactly as Facebook would hit it.

1. Start your local environment (`npm run dev` in frontend, `node server.js` in backend).
2. Go to `http://localhost:5173/playground`. 
3. Send a simulated message.
4. Watch the `Dashboard` for live job processing timeline.

### Unit Tests
To verify core timing and pagination math constraints:
```bash
cd backend
node tests.js
```
