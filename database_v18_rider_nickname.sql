-- ============================================
-- V18 — Colonne nickname_url sur team
-- ============================================
-- Permet à l'admin d'uploader pour chaque rider une "photo du pseudo"
-- (graphique de nom style graffiti) qui s'affiche sous l'avatar dans
-- la grille et sur sa fiche présentation.
--
-- Idempotent : ré-exécutable sans risque.
-- ============================================

ALTER TABLE public.team
  ADD COLUMN IF NOT EXISTS nickname_url text;

-- Vérification
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'team'
  AND column_name IN ('image_url', 'nickname_url', 'hero_photo_url');

-- Fin V18
