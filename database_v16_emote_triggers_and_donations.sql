-- ============================================
-- V16 — Logs des déclenchements d'emotes + tweaks RLS pour historique
-- ============================================
-- Crée la table `emote_triggers` pour garder un historique permanent
-- de qui a déclenché quelle emote pendant quelle course.
--
-- Idempotent : ré-exécutable sans risque.
-- ============================================

-- 1. Table emote_triggers
CREATE TABLE IF NOT EXISTS public.emote_triggers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  display_name text NOT NULL,         -- snapshotté au moment du trigger
  item_slug text NOT NULL,            -- ex 'emote_poop'
  session_id uuid REFERENCES public.race_sessions(id) ON DELETE SET NULL,
  triggered_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS emote_triggers_session_idx ON public.emote_triggers(session_id);
CREATE INDEX IF NOT EXISTS emote_triggers_user_idx    ON public.emote_triggers(user_id);
CREATE INDEX IF NOT EXISTS emote_triggers_slug_idx    ON public.emote_triggers(item_slug);

ALTER TABLE public.emote_triggers ENABLE ROW LEVEL SECURITY;

-- Lecture publique : pour qu'un viewer en retard puisse voir les
-- emotes déclenchées avant son arrivée (replay), et pour les stats
-- admin. Ne contient pas de donnée sensible (juste un slug + pseudo).
DROP POLICY IF EXISTS "emote_triggers_read" ON public.emote_triggers;
CREATE POLICY "emote_triggers_read"
  ON public.emote_triggers FOR SELECT
  USING (true);

-- Insertion : tout le monde, mais on contrôle côté client (faut un
-- achat valide). C'est cohérent avec donations qui sont aussi en
-- INSERT public car PayPal valide côté client.
DROP POLICY IF EXISTS "emote_triggers_insert" ON public.emote_triggers;
CREATE POLICY "emote_triggers_insert"
  ON public.emote_triggers FOR INSERT
  WITH CHECK (true);

-- Suppression réservée aux admins (pour modération éventuelle)
DROP POLICY IF EXISTS "emote_triggers_admin" ON public.emote_triggers;
CREATE POLICY "emote_triggers_admin"
  ON public.emote_triggers FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Active Realtime pour propagation cross-session des triggers
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.emote_triggers;
  EXCEPTION WHEN duplicate_object THEN
    -- déjà ajoutée, on ignore
    NULL;
  END;
END $$;


-- 2. (re)Vérifications — colonnes correctes de pg_policy : polname / polcmd
--    polcmd : 'r' = SELECT, 'a' = INSERT, 'w' = UPDATE, 'd' = DELETE, '*' = ALL
SELECT 'emote_triggers' AS table_name,
       COUNT(*) AS row_count
FROM public.emote_triggers;

SELECT polname, polcmd
FROM pg_policy
WHERE polrelid = 'public.emote_triggers'::regclass;

-- Fin V16
