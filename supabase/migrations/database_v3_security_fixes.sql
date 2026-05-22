-- ==========================================
-- MIGRATION V3 : CORRECTIFS SÉCURITÉ
-- Mob Y Dick — À exécuter dans Supabase SQL Editor
-- ==========================================
--
-- Cette migration corrige :
--   1. Bootstrap admin (le seul moyen sûr — plus jamais depuis le client)
--   2. RLS race_sessions / race_teams / race_laps trop permissives
--      (avant : tout user connecté pouvait modifier/supprimer N'IMPORTE QUELLE course)
--      (après : seul le créateur de la session OU un admin peut modifier)
--
-- Ce script est IDEMPOTENT : tu peux le relancer sans risque.
-- ==========================================


-- ─────────────────────────────────────────
-- 1. Bootstrap admin : promouvoir le compte propriétaire
-- ─────────────────────────────────────────
-- Si le profil existe déjà, on s'assure qu'il a le rôle admin et toutes les permissions.
-- Si le profil n'existe pas encore (compte pas créé), cette ligne ne fait rien — il faut
-- d'abord créer le compte via le site, puis relancer cette ligne.
UPDATE public.profiles
SET role = 'admin',
    permissions = '["manage_events","manage_products","manage_gallery","manage_team","manage_bikes","manage_settings","manage_races","manage_users","moderate_content"]'::jsonb
WHERE email = 'cartiercorentin@gmail.com';


-- ─────────────────────────────────────────
-- 2. Helper : vérifier si user connecté est admin/organisateur
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_user_race_manager()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'organisateur')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;


-- ─────────────────────────────────────────
-- 3. RLS race_sessions : restreindre UPDATE/DELETE
-- ─────────────────────────────────────────
DROP POLICY IF EXISTS "race_sessions_insert" ON public.race_sessions;
DROP POLICY IF EXISTS "race_sessions_update" ON public.race_sessions;
DROP POLICY IF EXISTS "race_sessions_delete" ON public.race_sessions;

-- INSERT : seuls admin/organisateur peuvent créer une session
CREATE POLICY "race_sessions_insert" ON public.race_sessions
  FOR INSERT WITH CHECK (
    public.is_user_race_manager()
    AND (created_by IS NULL OR created_by = auth.uid())
  );

-- UPDATE : créateur de la session OU admin
CREATE POLICY "race_sessions_update" ON public.race_sessions
  FOR UPDATE USING (
    auth.uid() = created_by
    OR public.is_user_admin()
  );

-- DELETE : créateur OU admin (déjà ok, on réécrit pour cohérence)
CREATE POLICY "race_sessions_delete" ON public.race_sessions
  FOR DELETE USING (
    auth.uid() = created_by
    OR public.is_user_admin()
  );


-- ─────────────────────────────────────────
-- 4. RLS race_teams : restreindre INSERT/UPDATE/DELETE
-- ─────────────────────────────────────────
DROP POLICY IF EXISTS "race_teams_insert" ON public.race_teams;
DROP POLICY IF EXISTS "race_teams_update" ON public.race_teams;
DROP POLICY IF EXISTS "race_teams_delete" ON public.race_teams;

-- INSERT : créateur de la session parente OU admin
CREATE POLICY "race_teams_insert" ON public.race_teams
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.race_sessions s
      WHERE s.id = race_teams.session_id
        AND (s.created_by = auth.uid() OR public.is_user_admin())
    )
  );

-- UPDATE : idem
CREATE POLICY "race_teams_update" ON public.race_teams
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.race_sessions s
      WHERE s.id = race_teams.session_id
        AND (s.created_by = auth.uid() OR public.is_user_admin())
    )
  );

-- DELETE : idem
CREATE POLICY "race_teams_delete" ON public.race_teams
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.race_sessions s
      WHERE s.id = race_teams.session_id
        AND (s.created_by = auth.uid() OR public.is_user_admin())
    )
  );


-- ─────────────────────────────────────────
-- 5. RLS race_laps : restreindre INSERT/UPDATE/DELETE
-- ─────────────────────────────────────────
DROP POLICY IF EXISTS "race_laps_insert" ON public.race_laps;
DROP POLICY IF EXISTS "race_laps_update" ON public.race_laps;
DROP POLICY IF EXISTS "race_laps_delete" ON public.race_laps;

-- INSERT : créateur de la session OU admin
CREATE POLICY "race_laps_insert" ON public.race_laps
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.race_sessions s
      WHERE s.id = race_laps.session_id
        AND (s.created_by = auth.uid() OR public.is_user_admin())
    )
  );

-- UPDATE : créateur de la session OU admin
CREATE POLICY "race_laps_update" ON public.race_laps
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.race_sessions s
      WHERE s.id = race_laps.session_id
        AND (s.created_by = auth.uid() OR public.is_user_admin())
    )
  );

-- DELETE : créateur de la session OU admin
CREATE POLICY "race_laps_delete" ON public.race_laps
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.race_sessions s
      WHERE s.id = race_laps.session_id
        AND (s.created_by = auth.uid() OR public.is_user_admin())
    )
  );


-- ─────────────────────────────────────────
-- 6. Vérifications post-migration (à lire dans le résultat)
-- ─────────────────────────────────────────
SELECT 'Profil admin' AS check, email, role
  FROM public.profiles
  WHERE email = 'cartiercorentin@gmail.com';

SELECT 'Policies race_*' AS check, tablename, policyname, cmd
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('race_sessions', 'race_teams', 'race_laps')
  ORDER BY tablename, cmd;

-- Fin V3
