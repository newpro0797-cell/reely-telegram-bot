-- ============================================
-- Reely v2 — Migration Script
-- ============================================
-- New chatbot-based architecture with credit system.
-- SAFE TO RUN: Uses IF NOT EXISTS / IF EXISTS guards.
-- ============================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- 1. MODIFY profiles table — add credits + video counter
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='credits') THEN
    ALTER TABLE public.profiles ADD COLUMN credits INTEGER DEFAULT 200;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='total_videos_created') THEN
    ALTER TABLE public.profiles ADD COLUMN total_videos_created INTEGER DEFAULT 0;
  END IF;
END $$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

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


-- ============================================
-- 2. NEW TABLE: chat_sessions
-- ============================================
CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  title TEXT DEFAULT 'New Reel',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Users can create own sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Users can update own sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Users can delete own sessions" ON public.chat_sessions;

CREATE POLICY "Users can view own sessions"
  ON public.chat_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own sessions"
  ON public.chat_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions"
  ON public.chat_sessions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own sessions"
  ON public.chat_sessions FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS chat_sessions_updated_at ON public.chat_sessions;
CREATE TRIGGER chat_sessions_updated_at
  BEFORE UPDATE ON public.chat_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- ============================================
-- 3. NEW TABLE: reel_jobs
-- ============================================
CREATE TABLE IF NOT EXISTS public.reel_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.chat_sessions ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users NOT NULL,
  prompt TEXT,
  video_title TEXT,
  narration_script TEXT,
  narration_approved BOOLEAN DEFAULT false,
  audio_duration_seconds FLOAT,
  total_scenes INTEGER,
  image_prompts_json JSONB,
  image_prompts_approved BOOLEAN DEFAULT false,
  selected_transition TEXT DEFAULT 'fade',
  selected_animation TEXT DEFAULT 'ken_burns',
  burn_subtitles BOOLEAN DEFAULT false,
  video_aspect_ratio TEXT DEFAULT '9:16',
  status TEXT DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'generating_script', 'awaiting_script_approval',
      'generating_audio', 'generating_image_prompts',
      'awaiting_prompts_approval', 'generating_images',
      'awaiting_style_selection', 'stitching',
      'complete', 'failed'
    )),
  video_storage_path TEXT,
  credits_deducted INTEGER,
  error_message TEXT,
  log_json JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.reel_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own jobs" ON public.reel_jobs;
DROP POLICY IF EXISTS "Users can create own jobs" ON public.reel_jobs;
DROP POLICY IF EXISTS "Users can update own jobs" ON public.reel_jobs;

CREATE POLICY "Users can view own jobs"
  ON public.reel_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own jobs"
  ON public.reel_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own jobs"
  ON public.reel_jobs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ============================================
-- 4. NEW TABLE: reel_scenes (replaces run_scenes for new jobs)
-- ============================================
CREATE TABLE IF NOT EXISTS public.reel_scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES public.reel_jobs ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users NOT NULL,
  scene_number INTEGER,
  image_prompt TEXT,
  narration_segment TEXT,
  display_duration_seconds FLOAT,
  image_storage_path TEXT,
  status TEXT DEFAULT 'pending'
);

ALTER TABLE public.reel_scenes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own reel_scenes" ON public.reel_scenes;
DROP POLICY IF EXISTS "Users can create own reel_scenes" ON public.reel_scenes;
DROP POLICY IF EXISTS "Users can update own reel_scenes" ON public.reel_scenes;
DROP POLICY IF EXISTS "Users can delete own reel_scenes" ON public.reel_scenes;

CREATE POLICY "Users can view own reel_scenes"
  ON public.reel_scenes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own reel_scenes"
  ON public.reel_scenes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reel_scenes"
  ON public.reel_scenes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own reel_scenes"
  ON public.reel_scenes FOR DELETE
  USING (auth.uid() = user_id);


-- ============================================
-- 5. NEW TABLE: credit_transactions
-- ============================================
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  job_id UUID REFERENCES public.reel_jobs,
  type TEXT NOT NULL CHECK (type IN ('signup_bonus', 'video_creation', 'manual_topup')),
  credits_before INTEGER,
  credits_change INTEGER,
  credits_after INTEGER,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own transactions" ON public.credit_transactions;

CREATE POLICY "Users can view own transactions"
  ON public.credit_transactions FOR SELECT
  USING (auth.uid() = user_id);


-- ============================================
-- 6. ENABLE REALTIME on reel_jobs
-- ============================================
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.reel_jobs;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.reel_scenes;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


-- ============================================
-- 7. UPDATE handle_new_user trigger
--    Initialize credits=200 and insert signup_bonus transaction
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, credits, total_videos_created)
  VALUES (NEW.id, NEW.email, 200, 0)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.credit_transactions (user_id, type, credits_before, credits_change, credits_after, description)
  VALUES (NEW.id, 'signup_bonus', 0, 200, 200, 'Welcome bonus — 200 free credits');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================
-- 8. STORAGE BUCKETS (ensure they exist)
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('reely-temp', 'reely-temp', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('reely-videos', 'reely-videos', false)
ON CONFLICT (id) DO NOTHING;

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
-- DONE! New tables: chat_sessions, reel_jobs, reel_scenes, credit_transactions
-- Modified: profiles (added credits, total_videos_created)
-- ============================================
