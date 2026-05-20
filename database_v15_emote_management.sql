-- ============================================
-- V15 — Emote Management: colonnes media + bucket storage
-- ============================================
-- Ajoute les colonnes nécessaires pour stocker
-- les fichiers uploadés (GIF/MP4/Son) pour chaque emote.
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
ON CONFLICT (id) DO NOTHING;

-- 3. Policies : tout le monde peut lire, admins/organisateurs peuvent upload
CREATE POLICY IF NOT EXISTS "Public read emote assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'emote-assets');

CREATE POLICY IF NOT EXISTS "Admin upload emote assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'emote-assets'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'organisateur')
      )
    )
  );

CREATE POLICY IF NOT EXISTS "Admin update emote assets"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'emote-assets'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'organisateur')
      )
    )
  );

CREATE POLICY IF NOT EXISTS "Admin delete emote assets"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'emote-assets'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'organisateur')
      )
    )
  );

-- 4. Vérification
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'shop_items'
  AND column_name IN ('media_url', 'media_type');

-- Fin V15
