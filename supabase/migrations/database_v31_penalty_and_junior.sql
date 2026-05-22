-- ============================================
-- V31 — Pénalités + catégorie Junior
-- ============================================
-- Objectifs :
--   1. Garantir la présence de la colonne `penalty_laps` sur race_teams.
--      (Le code la lit/écrit depuis longtemps mais aucune migration ne l'a
--      jamais créée — elle existait peut-être seulement en prod, à la main.)
--   2. Relâcher la contrainte CHECK sur pilot_X_sex pour accepter 'J' (Junior),
--      sinon l'insertion d'une équipe avec un pilote Junior échoue silencieusement.
-- ============================================

-- 1. Colonne penalty_laps (idempotent)
ALTER TABLE public.race_teams
  ADD COLUMN IF NOT EXISTS penalty_laps integer NOT NULL DEFAULT 0;

-- 2. Mise à jour des CHECK constraints sur les sexes pilotes
ALTER TABLE public.race_teams
  DROP CONSTRAINT IF EXISTS race_teams_pilot_1_sex_check;
ALTER TABLE public.race_teams
  DROP CONSTRAINT IF EXISTS race_teams_pilot_2_sex_check;
ALTER TABLE public.race_teams
  DROP CONSTRAINT IF EXISTS race_teams_pilot_3_sex_check;

ALTER TABLE public.race_teams
  ADD CONSTRAINT race_teams_pilot_1_sex_check CHECK (pilot_1_sex IN ('M', 'F', 'J'));
ALTER TABLE public.race_teams
  ADD CONSTRAINT race_teams_pilot_2_sex_check CHECK (pilot_2_sex IS NULL OR pilot_2_sex IN ('M', 'F', 'J'));
ALTER TABLE public.race_teams
  ADD CONSTRAINT race_teams_pilot_3_sex_check CHECK (pilot_3_sex IS NULL OR pilot_3_sex IN ('M', 'F', 'J'));

-- Fin V31
