-- ============================================
-- V19 — Modérateurs peuvent éditer les fiches riders
-- ============================================
-- Avant V19 :
--   - public.team : UPDATE réservé aux admins (V8)
--   - storage.objects bucket team-assets : upload/update/delete
--     réservés à admin + organisateur (V17)
--
-- Conséquence : un modérateur voyait la fiche rider mais ne pouvait
-- ni modifier le texte, ni changer l'avatar / la hero photo / le
-- nickname (UPDATE refusé par RLS).
--
-- Cette migration élargit les écritures aux modérateurs sur :
--   1. la table public.team : UPDATE + INSERT (ajouter un rider)
--   2. le bucket storage team-assets (upload/update/delete d'images)
--
-- DELETE d'un rider reste admin uniquement (action destructive).
--
-- Idempotent : ré-exécutable sans risque.
-- ============================================


-- ─────────────────────────────────────────
-- 0. Helper : public.is_user_admin_or_moderator()
--    Déjà créé en V6 / redéfini en V8. On le réaffirme ici au cas où
--    cette migration tournerait sur une base non-V8.
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_user_admin_or_moderator()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'moderator')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;


-- ─────────────────────────────────────────
-- 1. public.team : UPDATE + INSERT ouverts aux admins + modérateurs
--    DELETE reste admin uniquement.
-- ─────────────────────────────────────────
DROP POLICY IF EXISTS "team_update" ON public.team;
CREATE POLICY "team_update" ON public.team
  FOR UPDATE
  USING (public.is_user_admin_or_moderator());

DROP POLICY IF EXISTS "team_insert" ON public.team;
CREATE POLICY "team_insert" ON public.team
  FOR INSERT
  WITH CHECK (public.is_user_admin_or_moderator());


-- ─────────────────────────────────────────
-- 2. storage.objects (bucket team-assets) : upload/update/delete
--    ouverts aux admins + organisateurs + modérateurs.
--    La lecture publique reste inchangée.
-- ─────────────────────────────────────────
DROP POLICY IF EXISTS "Admin upload team assets" ON storage.objects;
CREATE POLICY "Admin upload team assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'team-assets'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'organisateur', 'moderator')
    )
  );

DROP POLICY IF EXISTS "Admin update team assets" ON storage.objects;
CREATE POLICY "Admin update team assets"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'team-assets'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'organisateur', 'moderator')
    )
  );

DROP POLICY IF EXISTS "Admin delete team assets" ON storage.objects;
CREATE POLICY "Admin delete team assets"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'team-assets'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'organisateur', 'moderator')
    )
  );


-- ─────────────────────────────────────────
-- 3. Vérifications
-- ─────────────────────────────────────────
SELECT 'team policies' AS check, polname, polcmd
  FROM pg_policy
  WHERE polrelid = 'public.team'::regclass
  ORDER BY polname;

SELECT 'team-assets policies' AS check, policyname, cmd
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname LIKE '%team assets%'
  ORDER BY cmd;

-- Fin V19
