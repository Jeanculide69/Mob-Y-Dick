-- ============================================
-- V37 — Durée prévue de l'événement
-- ============================================
-- Ajoute une colonne `duration_minutes` à race_sessions pour stocker la
-- durée prévue de la course (en minutes). Permet d'afficher un décompte
-- du temps restant sous le chrono (admin + spectateurs).
--
-- NULL = pas de durée définie → décompte non affiché.

ALTER TABLE public.race_sessions
  ADD COLUMN IF NOT EXISTS duration_minutes integer
  CHECK (duration_minutes IS NULL OR duration_minutes > 0);

-- Vérification
SELECT column_name, data_type, column_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'race_sessions'
    AND column_name = 'duration_minutes';

-- Fin V37
