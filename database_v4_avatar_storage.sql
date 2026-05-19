-- ==========================================
-- MIGRATION V4 : STOCKAGE AVATARS
-- Mob Y Dick — À exécuter dans Supabase SQL Editor
-- ==========================================
--
-- Crée le bucket Storage "avatars" et ses politiques RLS :
--   - Lecture publique (les avatars s'affichent partout)
--   - Upload/update/delete autorisé seulement dans le dossier de
--     l'utilisateur (chemin = "<user_id>/<filename>")
--
-- Idempotent : tu peux le relancer sans risque.
-- ==========================================


-- ─────────────────────────────────────────
-- 1. Création du bucket
-- ─────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152, -- 2 MB max
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;


-- ─────────────────────────────────────────
-- 2. Politiques RLS sur storage.objects
-- ─────────────────────────────────────────
DROP POLICY IF EXISTS "Avatar public read" ON storage.objects;
DROP POLICY IF EXISTS "Avatar self upload" ON storage.objects;
DROP POLICY IF EXISTS "Avatar self update" ON storage.objects;
DROP POLICY IF EXISTS "Avatar self delete" ON storage.objects;

-- Lecture publique de tous les avatars
CREATE POLICY "Avatar public read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'avatars');

-- Un utilisateur connecté peut uploader UNIQUEMENT dans son propre dossier
-- (le chemin doit commencer par son UUID)
CREATE POLICY "Avatar self upload" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Update de ses propres fichiers
CREATE POLICY "Avatar self update" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Delete de ses propres fichiers
CREATE POLICY "Avatar self delete" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- ─────────────────────────────────────────
-- 3. Vérifications
-- ─────────────────────────────────────────
SELECT 'Bucket' AS check, id, public, file_size_limit
  FROM storage.buckets
  WHERE id = 'avatars';

SELECT 'Policy' AS check, policyname, cmd
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname LIKE 'Avatar%'
  ORDER BY cmd;

-- Fin V4
