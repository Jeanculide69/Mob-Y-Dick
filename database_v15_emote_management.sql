-- ============================================
-- V15 — Emote Management: colonnes media + bucket storage
-- ============================================
-- Ajoute les colonnes nécessaires pour stocker
-- les fichiers uploadés (GIF/MP4/Son) pour chaque emote,
-- et crée le bucket Supabase Storage 'emote-assets'.
--
-- Idempotent : tu peux relancer sans risque.
-- ============================================

-- 1. Colonnes manquantes sur shop_items
ALTER TABLE public.shop_items
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS media_type text DEFAULT 'emoji';
  -- media_type: 'emoji' (défaut, juste un emoji), 'gif', 'mp4'

-- 2. Créer le bucket storage pour les assets emotes
INSERT INTO storage.buckets (id, name, public)
VALUES ('emote-assets', 'emote-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 3. Policies storage : tout le monde peut lire, admins/organisateurs uploadent
--   ⚠️ PostgreSQL ne supporte PAS `CREATE POLICY IF NOT EXISTS`. On utilise
--      DROP POLICY IF EXISTS + CREATE POLICY pour rester idempotent.

DROP POLICY IF EXISTS "Public read emote assets" ON storage.objects;
CREATE POLICY "Public read emote assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'emote-assets');

DROP POLICY IF EXISTS "Admin upload emote assets" ON storage.objects;
CREATE POLICY "Admin upload emote assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'emote-assets'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'organisateur')
    )
  );

DROP POLICY IF EXISTS "Admin update emote assets" ON storage.objects;
CREATE POLICY "Admin update emote assets"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'emote-assets'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'organisateur')
    )
  );

DROP POLICY IF EXISTS "Admin delete emote assets" ON storage.objects;
CREATE POLICY "Admin delete emote assets"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'emote-assets'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'organisateur')
    )
  );

-- 4. Vérifications (pour visualiser dans le SQL Editor)
SELECT id, name, public
FROM storage.buckets
WHERE id = 'emote-assets';

SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'shop_items'
  AND column_name IN ('media_url', 'media_type');

-- Fin V15
