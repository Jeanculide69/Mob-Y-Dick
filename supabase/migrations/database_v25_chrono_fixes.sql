-- ============================================
-- V25 — Fix pour UPSERT Chrono (ON CONFLICT)
-- ============================================
-- Objectif : Corriger l'erreur de synchronisation "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- 
-- Explication : PostgREST (l'API de Supabase) nécessite une vraie contrainte UNIQUE 
-- (et non un index unique partiel) pour faire fonctionner la directive "onConflict".
--
-- ============================================

-- 1. On attribue un UUID aux anciens tours qui n'ont pas encore de client_id.
UPDATE public.race_laps 
SET client_id = gen_random_uuid() 
WHERE client_id IS NULL;

-- 2. On supprime l'index partiel créé précédemment dans la V23.
DROP INDEX IF EXISTS race_laps_client_id_unique;

-- 3. On ajoute une vraie contrainte UNIQUE sur la colonne client_id.
ALTER TABLE public.race_laps 
DROP CONSTRAINT IF EXISTS race_laps_client_id_key;

ALTER TABLE public.race_laps 
ADD CONSTRAINT race_laps_client_id_key UNIQUE (client_id);

-- 4. (Optionnel mais recommandé) Rendre la colonne obligatoire.
ALTER TABLE public.race_laps 
ALTER COLUMN client_id SET NOT NULL;

-- Fin V25
