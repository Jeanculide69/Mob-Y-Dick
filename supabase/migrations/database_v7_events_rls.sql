-- ==========================================
-- MIGRATION V7 : RLS EVENEMENTS (admin + organisateur)
-- Mob Y Dick — À exécuter dans Supabase SQL Editor
-- ==========================================
--
-- Avant : table events laissait passer INSERT/UPDATE/DELETE pour
--         tout user connecte (heritage de setup_supabase.mjs avec
--         policies "TO authenticated USING (true)").
-- Apres : seul admin OU organisateur peut creer/modifier/supprimer
--         un evenement. Lecture toujours publique.
--
-- Idempotent : tu peux relancer sans risque.
-- ==========================================


-- ─────────────────────────────────────────
-- 1. S'assurer que RLS est active
-- ─────────────────────────────────────────
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────
-- 2. Helper : is admin OR organisateur
--    (deja cree en V3 sous le nom is_user_race_manager() — meme logique,
--    on le reutilise pour ne pas dupliquer)
-- ─────────────────────────────────────────
-- Aucune nouvelle fonction necessaire : is_user_race_manager() retourne
-- deja true pour role IN ('admin', 'organisateur').


-- ─────────────────────────────────────────
-- 3. Policies events
-- ─────────────────────────────────────────
DROP POLICY IF EXISTS "events_read" ON public.events;
DROP POLICY IF EXISTS "events_insert" ON public.events;
DROP POLICY IF EXISTS "events_update" ON public.events;
DROP POLICY IF EXISTS "events_delete" ON public.events;
-- Cleanup des anciennes policies permissives heritees de setup_supabase.mjs
DROP POLICY IF EXISTS "Public read events" ON public.events;
DROP POLICY IF EXISTS "Auth insert events" ON public.events;
DROP POLICY IF EXISTS "Auth update events" ON public.events;
DROP POLICY IF EXISTS "Auth delete events" ON public.events;

-- Lecture publique
CREATE POLICY "events_read" ON public.events
  FOR SELECT
  USING (true);

-- INSERT : admin OU organisateur
CREATE POLICY "events_insert" ON public.events
  FOR INSERT
  WITH CHECK (public.is_user_race_manager());

-- UPDATE : admin OU organisateur
CREATE POLICY "events_update" ON public.events
  FOR UPDATE
  USING (public.is_user_race_manager());

-- DELETE : admin OU organisateur
CREATE POLICY "events_delete" ON public.events
  FOR DELETE
  USING (public.is_user_race_manager());


-- ─────────────────────────────────────────
-- 4. Verifications
-- ─────────────────────────────────────────
SELECT 'RLS events' AS check, relname,
       CASE WHEN relrowsecurity THEN '✅ active' ELSE '❌ inactive' END AS status
  FROM pg_class
  WHERE relname = 'events' AND relnamespace = 'public'::regnamespace;

SELECT 'Policies events' AS check, policyname, cmd
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'events'
  ORDER BY cmd;

-- Fin V7
