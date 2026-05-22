-- ============================================
-- RESET TOUT L'HISTORIQUE MOTO — 2026-05-22
-- ============================================
-- ⚠️ SCRIPT DESTRUCTIF — IRRÉVERSIBLE SANS BACKUP ⚠️
--
-- À copier/coller dans le SQL Editor Supabase et exécuter MANUELLEMENT.
-- Wrappé en transaction : si une étape échoue, RIEN n'est supprimé.
--
-- Périmètre supprimé :
--   • race_laps, race_teams, race_announcements (cascadent depuis race_sessions)
--   • race_sessions
--   • events
--   • live_messages (messages live lus par le bot)
--   • moto_affiliations (affiliations user ↔ moto)
--   • moto_profiles (fiches motos)
--   • bikes (motos de la team)
--
-- CONSERVÉ :
--   • profiles (utilisateurs)
--   • shop_items (catalogue boutique)
--   • user_purchases (achats validés — les session_id seront mis à NULL par la FK)
--   • orders (commandes Stripe)
--   • emote_triggers (les session_id seront mis à NULL par la FK)
--   • chat_messages, photo_comments, gallery, team, sponsors, contact_messages, settings
-- ============================================

BEGIN;

-- ─── ÉTAT AVANT ──────────────────────────────
SELECT '=== AVANT RESET ===' AS step;
SELECT 'race_sessions' AS table_name, count(*) AS rows FROM public.race_sessions
UNION ALL SELECT 'race_teams',     count(*) FROM public.race_teams
UNION ALL SELECT 'race_laps',      count(*) FROM public.race_laps
UNION ALL SELECT 'race_announcements', count(*) FROM public.race_announcements
UNION ALL SELECT 'live_messages',  count(*) FROM public.live_messages
UNION ALL SELECT 'events',         count(*) FROM public.events;

-- ─── 1. DONNÉES DE COURSE ────────────────────
-- race_laps : FK ON DELETE CASCADE sur race_sessions ET race_teams.
-- On supprime explicitement dans le bon ordre pour rester robuste même
-- si quelqu'un a modifié les contraintes manuellement.
DELETE FROM public.race_laps;
DELETE FROM public.race_announcements;
DELETE FROM public.race_teams;

-- ─── 2. LIVE MESSAGES ────────────────────────
-- Pas de FK cascade vers race_sessions (ON DELETE SET NULL), donc on
-- doit les supprimer explicitement avant que les sessions disparaissent.
DELETE FROM public.live_messages;

-- ─── 3. SESSIONS + ÉVÉNEMENTS ────────────────
DELETE FROM public.race_sessions;
DELETE FROM public.events;

-- ─── 4. TABLES MOTO (existence optionnelle) ──
-- Ces tables ont peut-être été créées via le Supabase Studio sans
-- migration versionnée. On les vide UNIQUEMENT si elles existent,
-- sinon le DO block ignore silencieusement.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'moto_affiliations') THEN
    EXECUTE 'DELETE FROM public.moto_affiliations';
    RAISE NOTICE 'moto_affiliations vidée';
  ELSE
    RAISE NOTICE 'moto_affiliations introuvable — skip';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'moto_profiles') THEN
    EXECUTE 'DELETE FROM public.moto_profiles';
    RAISE NOTICE 'moto_profiles vidée';
  ELSE
    RAISE NOTICE 'moto_profiles introuvable — skip';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'bikes') THEN
    EXECUTE 'DELETE FROM public.bikes';
    RAISE NOTICE 'bikes vidée';
  ELSE
    RAISE NOTICE 'bikes introuvable — skip';
  END IF;
END $$;

-- ─── ÉTAT APRÈS ──────────────────────────────
SELECT '=== APRÈS RESET ===' AS step;
SELECT 'race_sessions' AS table_name, count(*) AS rows FROM public.race_sessions
UNION ALL SELECT 'race_teams',     count(*) FROM public.race_teams
UNION ALL SELECT 'race_laps',      count(*) FROM public.race_laps
UNION ALL SELECT 'race_announcements', count(*) FROM public.race_announcements
UNION ALL SELECT 'live_messages',  count(*) FROM public.live_messages
UNION ALL SELECT 'events',         count(*) FROM public.events;

-- ⚠️ DÉCOMMENTER LA LIGNE SUIVANTE POUR APPLIQUER POUR DE BON ⚠️
-- Tant qu'elle est commentée, c'est ROLLBACK = un dry-run sans dégâts.
-- COMMIT;
ROLLBACK;
