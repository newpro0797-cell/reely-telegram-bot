# Reely — AI Instagram Reel Creator

Full-stack multi-tenant SaaS for automating AI-powered Instagram Reel creation via a web chat interface.

## Tech Stack

- **Frontend**: React 19 + Tailwind CSS v4 (Vite)
- **Backend**: Vercel Serverless Functions (or Node.js Express via Docker)
- **Database/Auth/Storage**: Supabase (PostgreSQL + Auth + Storage + Realtime)
- **AI Images**: Z-Image-Turbo via Modal GPU endpoint
- **AI Audio**: Kokoro TTS via Modal endpoint
- **AI Video Stitching**: FFmpeg via Modal endpoint (Vercel) or native binary (Docker)
- **LLM**: Google Gemini API

---

## Deployment Options

### Option 1: Vercel (Recommended)

Deploy the `frontend/` directory to Vercel. All API routes live as serverless functions under `frontend/api/`.

#### Prerequisites
- Vercel account (Pro plan recommended for 300s function timeout)
- 3 Modal endpoints deployed: Z-Image, Kokoro TTS, **FFmpeg Stitcher**
- Supabase project

#### Steps

```bash
# 1. Deploy Modal endpoints
pip install modal
python3 -m modal setup
python3 -m modal deploy modal/ffmpeg_stitcher.py   # NEW for Vercel
python3 -m modal deploy zimage.py
python3 -m modal deploy kokoro_tts.py

# 2. Run Supabase migration
# Paste backend/supabase/migration.sql into Supabase SQL Editor

# 3. Disable email confirmation
# Supabase Dashboard → Authentication → Providers → Email → OFF

# 4. Deploy to Vercel
cd frontend
vercel deploy
```

#### Vercel Environment Variables

| Variable | Value |
|----------|-------|
| `SUPABASE_URL` | `https://your-project.supabase.co` |
| `SUPABASE_ANON_KEY` | Your anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Your service role key |
| `ENCRYPTION_KEY` | `openssl rand -hex 32` |
| `VITE_SUPABASE_URL` | Same as `SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | Same as `SUPABASE_ANON_KEY` |
| `MODAL_FFMPEG_ENDPOINT` | Your FFmpeg Modal endpoint URL |

---

### Option 2: Docker Compose

Full self-hosted deployment with FFmpeg running natively in the container.

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env with your credentials

# 2. Run Supabase migration
# Paste backend/supabase/migration.sql into Supabase SQL Editor

# 3. Start
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3000

---

## Project Structure

```
Reely/
├── docker-compose.yml          # Docker deployment
├── .env.example
├── modal/
│   └── ffmpeg_stitcher.py      # FFmpeg Modal endpoint (for Vercel)
├── backend/                    # Express backend (Docker mode)
│   ├── Dockerfile
│   ├── package.json
│   ├── server.js
│   ├── supabase/migration.sql
│   └── src/
│       ├── config/supabase.js
│       ├── middleware/auth.js
│       ├── utils/encryption.js
│       ├── routes/{workflows,runs,pipeline}.js
│       └── pipeline/{index,gemini,kokoro,zimage,ffmpeg,storage}.js
└── frontend/                   # Vite + React (deploys to Vercel)
    ├── vercel.json             # Vercel config
    ├── Dockerfile              # Docker alternative
    ├── package.json
    ├── vite.config.js
    ├── index.html
    ├── api/                    # Vercel Serverless Functions
    │   ├── _lib/{supabase,encryption,pipeline}.js
    │   ├── workflows/[[...path]].js
    │   ├── runs/[...path].js
    │   └── pipeline/[...path].js
    └── src/
        ├── main.jsx, App.jsx, index.css
        ├── lib/{supabase,api}.js
        ├── contexts/AuthContext.jsx
        ├── components/{Layout,Sidebar,ProtectedRoute,
        │              PipelineStepper,VideoPlayerCard}.jsx
        └── pages/{SignIn,SignUp,Dashboard,WorkflowWizard,
                   Chat,RunHistory,VideoDetail}.jsx
```
