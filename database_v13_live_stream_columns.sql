-- ==========================================
-- MIGRATION V13 : COLONNES LIVE STREAM SUR race_sessions
-- Mob Y Dick — À exécuter dans Supabase SQL Editor
-- ==========================================
--
-- Le composant LiveVideoBroadcaster utilise ces colonnes pour
-- activer/désactiver la diffusion vidéo et empêcher deux
-- organisateurs de streamer en même temps.
--
-- Sans ces colonnes, le SELECT/UPDATE échoue et renvoie
-- "Permission denied" côté navigateur.
--
-- Idempotent : tu peux relancer sans risque.
-- ==========================================

-- 1. Ajouter les colonnes manquantes
ALTER TABLE public.race_sessions
  ADD COLUMN IF NOT EXISTS live_stream_active boolean DEFAULT false;

ALTER TABLE public.race_sessions
  ADD COLUMN IF NOT EXISTS live_stream_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Vérification
SELECT column_name, data_type, column_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'race_sessions'
    AND column_name IN ('live_stream_active', 'live_stream_user_id');

-- Fin V13
