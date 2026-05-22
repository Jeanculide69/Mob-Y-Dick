-- ============================================
-- V23 — Fiabilité hors-ligne du chronométrage
-- ============================================
-- Objectif : zéro lap perdu, zéro doublon, même sous coupure réseau,
-- crash navigateur, JWT expiré ou syncs concurrents.
--
-- Mécanisme : chaque lap reçoit côté client un UUID `client_id` (v4)
-- généré au moment de la saisie. La queue locale (localStorage) stocke
-- ce client_id en clair. L'INSERT côté Supabase devient un UPSERT sur
-- la colonne `client_id` → un même lap rejoué N fois après un crash,
-- une reconnexion, ou un sync concurrent ne crée qu'UNE seule ligne.
--
-- L'index est PARTIEL (WHERE client_id IS NOT NULL) pour ne pas casser
-- la rétrocompatibilité avec les laps anciens (créés avant V23) qui
-- n'avaient pas de client_id. Eux restent uniques par PK uniquement.
--
-- Idempotent.
-- ============================================


-- ─────────────────────────────────────────
-- 1. race_laps : colonne client_id
-- ─────────────────────────────────────────
ALTER TABLE public.race_laps
  ADD COLUMN IF NOT EXISTS client_id uuid;

-- Index unique partiel : empêche les doublons quand client_id présent,
-- mais tolère NULL en quantité (anciens laps pré-V23).
CREATE UNIQUE INDEX IF NOT EXISTS race_laps_client_id_unique
  ON public.race_laps (client_id)
  WHERE client_id IS NOT NULL;


-- ─────────────────────────────────────────
-- 2. Index de tri pour le live + heartbeat
-- ─────────────────────────────────────────
-- La requête principale du viewer et du chrono est :
--   SELECT * FROM race_laps WHERE session_id = $1 ORDER BY recorded_at DESC
-- Sans index composite, sur une endurance de 4h × 50 équipes × 800 laps
-- on scan + sort la table à chaque polling/refetch. Cet index transforme
-- ça en index-only scan.
CREATE INDEX IF NOT EXISTS race_laps_session_recorded_idx
  ON public.race_laps (session_id, recorded_at DESC);


-- ─────────────────────────────────────────
-- 3. Vérifications
-- ─────────────────────────────────────────
SELECT 'Colonne client_id' AS check, column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'race_laps'
    AND column_name = 'client_id';

SELECT 'Index race_laps' AS check, indexname, indexdef
  FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'race_laps'
  ORDER BY indexname;

-- Fin V23
