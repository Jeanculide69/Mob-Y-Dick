-- ==========================================
-- MIGRATION V5 : ACCES COMPLET ORGANISATEURS
-- Mob Y Dick — À exécuter dans Supabase SQL Editor
-- ==========================================
--
-- Avant : un organisateur ne pouvait modifier que les courses qu'il
--         avait lui-même créées (RLS testait auth.uid() = created_by).
-- Après : N'IMPORTE QUEL organisateur peut gérer N'IMPORTE QUELLE
--         course (créer / modifier / supprimer sessions, équipes,
--         tours). Les admins gardent leur accès complet aussi.
--
-- La fonction is_user_race_manager() existe déjà (créée en V3) et
-- retourne true si l'utilisateur a le rôle 'admin' OU 'organisateur'.
-- On l'utilise partout au lieu de la condition created_by.
--
-- Idempotent : tu peux relancer sans risque.
-- ==========================================


-- ─────────────────────────────────────────
-- 1. race_sessions : tout organisateur peut tout faire
-- ─────────────────────────────────────────
DROP POLICY IF EXISTS "race_sessions_insert" ON public.race_sessions;
DROP POLICY IF EXISTS "race_sessions_update" ON public.race_sessions;
DROP POLICY IF EXISTS "race_sessions_delete" ON public.race_sessions;

CREATE POLICY "race_sessions_insert" ON public.race_sessions
  FOR INSERT WITH CHECK (
    public.is_user_race_manager()
  );

CREATE POLICY "race_sessions_update" ON public.race_sessions
  FOR UPDATE USING (
    public.is_user_race_manager()
  );

CREATE POLICY "race_sessions_delete" ON public.race_sessions
  FOR DELETE USING (
    public.is_user_race_manager()
  );


-- ─────────────────────────────────────────
-- 2. race_teams : tout organisateur peut gérer toutes les équipes
-- ─────────────────────────────────────────
DROP POLICY IF EXISTS "race_teams_insert" ON public.race_teams;
DROP POLICY IF EXISTS "race_teams_update" ON public.race_teams;
DROP POLICY IF EXISTS "race_teams_delete" ON public.race_teams;

CREATE POLICY "race_teams_insert" ON public.race_teams
  FOR INSERT WITH CHECK (
    public.is_user_race_manager()
  );

CREATE POLICY "race_teams_update" ON public.race_teams
  FOR UPDATE USING (
    public.is_user_race_manager()
  );

CREATE POLICY "race_teams_delete" ON public.race_teams
  FOR DELETE USING (
    public.is_user_race_manager()
  );


-- ─────────────────────────────────────────
-- 3. race_laps : tout organisateur peut saisir/modifier les chronos
-- ─────────────────────────────────────────
DROP POLICY IF EXISTS "race_laps_insert" ON public.race_laps;
DROP POLICY IF EXISTS "race_laps_update" ON public.race_laps;
DROP POLICY IF EXISTS "race_laps_delete" ON public.race_laps;

CREATE POLICY "race_laps_insert" ON public.race_laps
  FOR INSERT WITH CHECK (
    public.is_user_race_manager()
  );

CREATE POLICY "race_laps_update" ON public.race_laps
  FOR UPDATE USING (
    public.is_user_race_manager()
  );

CREATE POLICY "race_laps_delete" ON public.race_laps
  FOR DELETE USING (
    public.is_user_race_manager()
  );


-- ─────────────────────────────────────────
-- 4. Vérifications
-- ─────────────────────────────────────────
SELECT 'Policies race_*' AS check, tablename, policyname, cmd
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('race_sessions', 'race_teams', 'race_laps')
    AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
  ORDER BY tablename, cmd;

-- Fin V5
