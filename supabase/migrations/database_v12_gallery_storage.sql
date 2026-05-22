-- ==========================================
-- MIGRATION V12 : STOCKAGE GALERIE (PHOTOS / VIDEOS / PRODUITS)
-- Mob Y Dick — À exécuter dans Supabase SQL Editor
-- ==========================================
--
-- Crée le bucket Storage "Gallery" et ses politiques RLS :
--   - Lecture publique (tout le monde peut voir les images de la galerie/boutique)
--   - Upload/update/delete autorisé pour les administrateurs et organisateurs
--
-- Idempotent : tu peux le relancer sans risque.
-- ==========================================


-- ─────────────────────────────────────────
-- 1. Création du bucket "Gallery"
-- ─────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'Gallery',
  'Gallery',
  true,
  10485760, -- 10 MB max
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;


-- ─────────────────────────────────────────
-- 2. Politiques RLS sur storage.objects
-- ─────────────────────────────────────────
DROP POLICY IF EXISTS "Gallery public read" ON storage.objects;
DROP POLICY IF EXISTS "Gallery admin upload" ON storage.objects;
DROP POLICY IF EXISTS "Gallery admin update" ON storage.objects;
DROP POLICY IF EXISTS "Gallery admin delete" ON storage.objects;

-- Lecture publique
CREATE POLICY "Gallery public read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'Gallery');

-- Upload autorisé pour les membres du staff (admin ou permissions)
CREATE POLICY "Gallery admin upload" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'Gallery'
    AND (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'organisateur'))
      OR
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND 'manage_gallery' = ANY(permissions))
    )
  );

-- Update pour le staff
CREATE POLICY "Gallery admin update" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'Gallery'
    AND (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'organisateur'))
      OR
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND 'manage_gallery' = ANY(permissions))
    )
  );

-- Delete pour le staff
CREATE POLICY "Gallery admin delete" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'Gallery'
    AND (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'organisateur'))
      OR
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND 'manage_gallery' = ANY(permissions))
    )
  );
