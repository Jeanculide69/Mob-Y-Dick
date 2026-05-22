-- ==========================================
-- MIGRATION V2 : PERMISSIONS GRANULAIRES & COURSES
-- Mob Y Dick — Système de chronométrage live
-- ==========================================

-- ─────────────────────────────────────────
-- 1. Mise à jour des profils : rôle organisateur + permissions
-- ─────────────────────────────────────────
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('user', 'moderator', 'admin', 'organisateur'));

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT '[]'::jsonb;

-- ─────────────────────────────────────────
-- 2. Mise à jour table events : lien course
-- ─────────────────────────────────────────
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS has_race boolean DEFAULT false;

-- ─────────────────────────────────────────
-- 3. Table race_sessions : Sessions de course
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.race_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Session principale',
  status text DEFAULT 'setup' CHECK (status IN ('setup', 'live', 'finished', 'published')),
  categories jsonb DEFAULT '["Prototype","Cadre en V","Origine","50cc","70cc"]'::jsonb,
  created_by uuid REFERENCES public.profiles(id),
  started_at timestamptz,
  finished_at timestamptz,
  is_public boolean DEFAULT false,
  created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.race_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "race_sessions_read" ON public.race_sessions
  FOR SELECT USING (true);
CREATE POLICY "race_sessions_insert" ON public.race_sessions
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "race_sessions_update" ON public.race_sessions
  FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "race_sessions_delete" ON public.race_sessions
  FOR DELETE USING (
    auth.uid() = created_by OR 
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ─────────────────────────────────────────
-- 4. Table race_teams : Équipes/motos inscrites
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.race_teams (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid REFERENCES public.race_sessions(id) ON DELETE CASCADE,
  moto_number integer NOT NULL,
  category text NOT NULL,
  pilot_1_name text NOT NULL,
  pilot_1_sex text DEFAULT 'M' CHECK (pilot_1_sex IN ('M', 'F')),
  pilot_2_name text,
  pilot_2_sex text CHECK (pilot_2_sex IN ('M', 'F')),
  pilot_3_name text,
  pilot_3_sex text CHECK (pilot_3_sex IN ('M', 'F')),
  created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.race_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "race_teams_read" ON public.race_teams
  FOR SELECT USING (true);
CREATE POLICY "race_teams_insert" ON public.race_teams
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "race_teams_update" ON public.race_teams
  FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "race_teams_delete" ON public.race_teams
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- ─────────────────────────────────────────
-- 5. Table race_laps : Passages/chronos
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.race_laps (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid REFERENCES public.race_sessions(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.race_teams(id) ON DELETE CASCADE,
  moto_number integer NOT NULL,
  lap_time_ms integer NOT NULL,
  lap_number integer NOT NULL DEFAULT 1,
  recorded_by uuid REFERENCES public.profiles(id),
  recorded_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.race_laps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "race_laps_read" ON public.race_laps
  FOR SELECT USING (true);
CREATE POLICY "race_laps_insert" ON public.race_laps
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "race_laps_update" ON public.race_laps
  FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "race_laps_delete" ON public.race_laps
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- ─────────────────────────────────────────
-- 6. Activer le Temps Réel (Realtime)
-- ─────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.race_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.race_teams;
ALTER PUBLICATION supabase_realtime ADD TABLE public.race_laps;

-- ─────────────────────────────────────────
-- Fin de la migration V2
-- ─────────────────────────────────────────
