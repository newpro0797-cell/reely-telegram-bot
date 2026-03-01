-- ============================================
-- Reely v3 — Instagram DM to AI Video Automation
-- ============================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- 1. admin_settings
-- ============================================
CREATE TABLE IF NOT EXISTS public.admin_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default settings
INSERT INTO public.admin_settings (key, value, description)
VALUES 
  ('default_duration_seconds', '15', 'Default video duration if user does not specify'),
  ('max_duration_seconds', '45', 'Maximum allowed video duration'),
  ('concurrency_limits', '{"workers": 5}', 'Max concurrent jobs processing')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- 2. inbound_messages
-- ============================================
CREATE TABLE IF NOT EXISTS public.inbound_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_message_id TEXT UNIQUE NOT NULL,
  sender_id TEXT NOT NULL,
  conversation_id TEXT,
  text_content TEXT,
  received_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'ignored'))
);

-- ============================================
-- 3. video_jobs
-- ============================================
CREATE TABLE IF NOT EXISTS public.video_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES public.inbound_messages ON DELETE CASCADE UNIQUE NOT NULL,
  status TEXT DEFAULT 'queued'
    CHECK (status IN (
      'queued', 'generating_narration', 'generating_audio', 
      'generating_image_prompts', 'generating_images', 
      'stitching', 'compressing', 'uploading', 'sending_dm', 
      'complete', 'failed'
    )),
  target_duration_seconds INTEGER DEFAULT 15,
  audio_duration_seconds FLOAT,
  narration_text TEXT,
  image_prompts JSONB, -- Array of generated prompts
  video_storage_url TEXT,
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for worker polling to easily find queued or processing jobs
CREATE INDEX IF NOT EXISTS idx_video_jobs_status_created_at ON public.video_jobs(status, created_at);

-- Auto-update updated_at for video_jobs
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS video_jobs_updated_at ON public.video_jobs;
CREATE TRIGGER video_jobs_updated_at
  BEFORE UPDATE ON public.video_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 4. job_events
-- ============================================
CREATE TABLE IF NOT EXISTS public.job_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES public.video_jobs ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for timeline fetching
CREATE INDEX IF NOT EXISTS idx_job_events_job_id_created_at ON public.job_events(job_id, created_at);

-- ============================================
-- RLS (Row Level Security)
-- For this automation system, the backend uses the Service Role key to bypass RLS.
-- We enable RLS and add policies for the Admin UI to read/write using authenticated user sessions.
-- ============================================
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_events ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users (Admins viewing the dashboard) to check and manage things.
DROP POLICY IF EXISTS "Allow authenticated read admin_settings" ON public.admin_settings;
CREATE POLICY "Allow authenticated read admin_settings" ON public.admin_settings FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow authenticated update admin_settings" ON public.admin_settings;
CREATE POLICY "Allow authenticated update admin_settings" ON public.admin_settings FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow authenticated read inbound_messages" ON public.inbound_messages;
CREATE POLICY "Allow authenticated read inbound_messages" ON public.inbound_messages FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow authenticated read video_jobs" ON public.video_jobs;
CREATE POLICY "Allow authenticated read video_jobs" ON public.video_jobs FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow authenticated update video_jobs" ON public.video_jobs;
CREATE POLICY "Allow authenticated update video_jobs" ON public.video_jobs FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow authenticated read job_events" ON public.job_events;
CREATE POLICY "Allow authenticated read job_events" ON public.job_events FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================
-- 5. STORAGE BUCKETS
-- Provide a bucket to hold the generated videos
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('ig-automated-videos', 'ig-automated-videos', false)
ON CONFLICT (id) DO NOTHING;

-- Service role can do all. Allow authenticated UI users to read if they need to preview videos.
DROP POLICY IF EXISTS "Allow authenticated read generated videos" ON storage.objects;
CREATE POLICY "Allow authenticated read generated videos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'ig-automated-videos'
    AND auth.role() = 'authenticated'
  );
