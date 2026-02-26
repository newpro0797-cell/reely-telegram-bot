-- ============================================
-- Reely — Supabase Migration Script
-- ============================================
-- SAFE TO RUN: This script uses IF NOT EXISTS / IF EXISTS
-- guards everywhere. It will NOT drop or modify your
-- existing tables (scene_jobs, video_jobs, profiles).
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ============================================
-- 1. MODIFY EXISTING: profiles table
-- ============================================
-- Your profiles table already exists with columns:
--   id (uuid), email (text), display_name (text),
--   credits_remaining (int4), plan (text), created_at (timestamptz)
--
-- Reely uses id + email from it. No schema changes needed.
-- We just need to make sure RLS is enabled and policies exist.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (safe re-run)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup (if trigger doesn't exist already)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================
-- 2. NEW TABLE: workflows
-- ============================================
CREATE TABLE IF NOT EXISTS public.workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  gemini_api_key_encrypted TEXT,
  gemini_model TEXT DEFAULT 'gemini-2.0-flash',
  modal_zimage_endpoint TEXT,
  modal_kokoro_endpoint TEXT,
  kokoro_voice TEXT DEFAULT 'af_sarah',
  kokoro_speed FLOAT DEFAULT 1.0,
  video_aspect_ratio TEXT DEFAULT '9:16',
  video_output_resolution TEXT DEFAULT '1080x1920',
  transition_effect TEXT DEFAULT 'fade',
  transition_duration FLOAT DEFAULT 0.5,
  ken_burns_enabled BOOLEAN DEFAULT true,
  output_quality_crf INTEGER DEFAULT 23,
  advanced_settings_json JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own workflows" ON public.workflows;
DROP POLICY IF EXISTS "Users can create own workflows" ON public.workflows;
DROP POLICY IF EXISTS "Users can update own workflows" ON public.workflows;
DROP POLICY IF EXISTS "Users can delete own workflows" ON public.workflows;

CREATE POLICY "Users can view own workflows"
  ON public.workflows FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own workflows"
  ON public.workflows FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own workflows"
  ON public.workflows FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own workflows"
  ON public.workflows FOR DELETE
  USING (auth.uid() = user_id);


-- ============================================
-- 3. NEW TABLE: workflow_runs
-- ============================================
CREATE TABLE IF NOT EXISTS public.workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES public.workflows ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users NOT NULL,
  trigger_message TEXT,
  video_title TEXT,
  narration_script TEXT,
  audio_duration_seconds FLOAT,
  total_scenes INTEGER,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'success', 'failed')),
  current_stage TEXT
    CHECK (current_stage IN (
      'script_generation', 'audio_generation',
      'image_generation', 'ffmpeg_stitching',
      'complete', 'failed'
    )),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  video_storage_path TEXT,
  error_message TEXT,
  log_json JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own runs" ON public.workflow_runs;
DROP POLICY IF EXISTS "Users can create own runs" ON public.workflow_runs;
DROP POLICY IF EXISTS "Users can update own runs" ON public.workflow_runs;

CREATE POLICY "Users can view own runs"
  ON public.workflow_runs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own runs"
  ON public.workflow_runs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own runs"
  ON public.workflow_runs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ============================================
-- 4. NEW TABLE: run_scenes
-- ============================================
CREATE TABLE IF NOT EXISTS public.run_scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES public.workflow_runs ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users NOT NULL,
  scene_number INTEGER,
  image_prompt TEXT,
  narration_segment TEXT,
  display_duration_seconds FLOAT,
  image_storage_path TEXT,
  status TEXT DEFAULT 'pending'
);

ALTER TABLE public.run_scenes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own scenes" ON public.run_scenes;
DROP POLICY IF EXISTS "Users can create own scenes" ON public.run_scenes;
DROP POLICY IF EXISTS "Users can update own scenes" ON public.run_scenes;
DROP POLICY IF EXISTS "Users can delete own scenes" ON public.run_scenes;

CREATE POLICY "Users can view own scenes"
  ON public.run_scenes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own scenes"
  ON public.run_scenes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own scenes"
  ON public.run_scenes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own scenes"
  ON public.run_scenes FOR DELETE
  USING (auth.uid() = user_id);


-- ============================================
-- 5. ENABLE REALTIME on workflow_runs
-- ============================================
-- This lets the frontend get live pipeline updates
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.workflow_runs;
EXCEPTION
  WHEN duplicate_object THEN
    NULL; -- already added, skip
END $$;


-- ============================================
-- 6. STORAGE BUCKETS
-- ============================================
-- reely-temp: temporary images + audio during pipeline
-- reely-videos: final output MP4s

INSERT INTO storage.buckets (id, name, public)
VALUES ('reely-temp', 'reely-temp', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('reely-videos', 'reely-videos', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: users can only access their own files
-- (folder structure: {user_id}/{run_id}/filename)

DROP POLICY IF EXISTS "Users can manage own temp files" ON storage.objects;
DROP POLICY IF EXISTS "Users can manage own videos" ON storage.objects;

CREATE POLICY "Users can manage own temp files"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'reely-temp'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'reely-temp'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can manage own videos"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'reely-videos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'reely-videos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- ============================================
-- 7. AUTO-UPDATE updated_at ON workflows
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS workflows_updated_at ON public.workflows;
CREATE TRIGGER workflows_updated_at
  BEFORE UPDATE ON public.workflows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- ============================================
-- DONE! You should see these new tables:
--   workflows, workflow_runs, run_scenes
-- And these storage buckets:
--   reely-temp, reely-videos
-- ============================================
