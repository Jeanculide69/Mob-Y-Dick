-- ============================================
-- V29 — S'assurer que live_messages est dans la publication Realtime
-- ============================================
-- v11 avait ajouté la table donations à supabase_realtime. v26 a fait un
-- ALTER TABLE donations RENAME TO live_messages — Postgres met à jour le
-- nom dans pg_publication_tables automatiquement, donc en théorie tout va
-- bien. Mais on a vu des cas où Supabase Realtime ne reflétait pas le
-- rename tout de suite côté cache, conduisant à des animations live qui
-- ne se déclenchaient plus sur les nouveaux INSERT.
--
-- Cette migration est un garde-fou idempotent : on s'assure que
-- live_messages est bien dans la publication, et on logue l'état actuel
-- pour debug.
-- ============================================


-- Si la table n'est plus dans la publication (cache désynchro), on la
-- ré-ajoute. Sinon, le DO bloc skip silencieusement.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'live_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_messages;
  END IF;
END $$;


-- Vérification
SELECT 'Publication Realtime' AS check, pubname, tablename
  FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime'
    AND tablename IN ('live_messages', 'user_purchases', 'donations')
  ORDER BY tablename;

-- Fin V29
