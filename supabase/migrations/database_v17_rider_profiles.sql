-- ============================================
-- V17 — Profils riders (bios, photos hero, rôles)
-- ============================================
-- Ajoute les colonnes nécessaires pour la page de présentation
-- individuelle de chaque rider (clic sur un membre du grille
-- "Les Riders" → modale plein écran avec bio + photos + onglets).
--
-- Idempotent : ré-exécutable sans risque.
-- ============================================

-- 1. Colonnes manquantes sur team
ALTER TABLE public.team
  ADD COLUMN IF NOT EXISTS role text,            -- ex 'Mécanicien chef'
  ADD COLUMN IF NOT EXISTS bio text,             -- bio longue, descriptive
  ADD COLUMN IF NOT EXISTS fun_fact text,        -- one-liner anecdote
  ADD COLUMN IF NOT EXISTS hero_photo_url text;  -- grande photo landscape

-- 2. Bucket Storage 'team-assets' pour uploader avatars & hero photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('team-assets', 'team-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public read team assets" ON storage.objects;
CREATE POLICY "Public read team assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'team-assets');

DROP POLICY IF EXISTS "Admin upload team assets" ON storage.objects;
CREATE POLICY "Admin upload team assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'team-assets'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'organisateur')
    )
  );

DROP POLICY IF EXISTS "Admin update team assets" ON storage.objects;
CREATE POLICY "Admin update team assets"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'team-assets'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'organisateur')
    )
  );

DROP POLICY IF EXISTS "Admin delete team assets" ON storage.objects;
CREATE POLICY "Admin delete team assets"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'team-assets'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'organisateur')
    )
  );


-- 3. Seed des bios pré-remplies pour les riders existants (UPSERT par name)
--    On utilise CASE pour matcher insensible à la casse sur le pseudo.

WITH rider_data (name_match, role, bio, fun_fact) AS (
  VALUES
  (
    'madmat',
    'Mécanicien Chef',
    'Le cerveau caché sous le capot. Petit, chauve, et redoutablement doué — MadMat passe ses week-ends à démonter des moteurs qui n''ont rien demandé. Son atelier sent l''huile, le café et la patience. Quand quelque chose grince, il sait pourquoi avant même d''ouvrir la trousse à outils.',
    'A déjà réparé une boîte de vitesses avec une pince à épiler.'
  ),
  (
    'leila',
    'Directrice d''Écurie & Comptable',
    'Le boss. Femme de Mat, gardienne du budget et de la sanité collective. Sans elle, la team aurait dépensé trois fois plus en pièces détachées et dormi sous la pluie au moins deux fois. Elle planifie, négocie, signe — et accessoirement râle quand on perd des reçus.',
    'Sait calculer un retour sur investissement plus vite qu''on tire un câble.'
  ),
  (
    'jeanculide',
    'Cerveau de la Team',
    '1m96 de muscle au service de l''électronique et du code. Créateur du site Mob Y Dick que tu es en train de lire (oui, c''est lui). Quand il ne pilote pas, il debugge — et quand il ne debugge pas, il fait des push-ups pour évacuer le stress des bugs.',
    'A déployé une feature à 23h45 en mangeant un kebab.'
  ),
  (
    'stickman',
    'Le Plume',
    'Maigrichon qui transforme son déficit calorique en accélération pure. À puissance égale, il colle 2km/h à tout le monde juste parce qu''il pèse trois fois rien. On dit que le vent doit demander la permission avant de passer.',
    'A perdu un pari en mangeant un kilo de pâtes : il a regagné 200g et a quand même bouffé tout le monde au virage suivant.'
  ),
  (
    'flo',
    'Notre Handicap',
    'Le poids mort que la team assume avec amour. Tombe régulièrement, casse souvent, mais revient toujours. Sa persévérance vaut tous les podiums — et personne ne célèbre une fin de course comme Flo, peu importe la position.',
    'Détient le record du plus grand nombre de chutes par tour. Personne ne lui prendra ce titre.'
  ),
  (
    'alex',
    'Le Bagarreur',
    'Personne n''ose le doubler. Pas par peur d''un coup de coude — par peur du regard qui suit. Alex pilote comme il vit : direct, sans détour, et avec une absence remarquable de patience pour ceux qui prennent leur ligne trop tard.',
    'A déjà gagné une course en partant dernier juste pour le plaisir d''agacer les autres.'
  ),
  (
    'fumax',
    'Détective Mécanique',
    'Le rival amical de MadMat à l''atelier. Pendant que les autres cherchent la panne, Fumax l''a déjà trouvée — souvent en posant juste la main sur le carter. Sa réputation : si Fumax ne sait pas ce qui cloche, c''est que la moto va bien.',
    'Diagnostique 80% des pannes à l''oreille. Les 20% restants, il les sent.'
  ),
  (
    'gauthier',
    'Le Cyclo-Mystère',
    'Membre officiel d''une équipe de motocross, mais préfère secrètement le vélo. Vient quand même à toutes les courses parce que l''ambiance vaut le détour. Plaisante un jour sur deux, et nul ne sait s''il prend vraiment quelque chose au sérieux.',
    'A déjà fait l''aller-retour à un événement de la team... en vélo. 80 km, 2 crevaisons.'
  )
)
UPDATE public.team t
SET
  role     = COALESCE(NULLIF(t.role, ''), r.role),
  bio      = COALESCE(NULLIF(t.bio, ''), r.bio),
  fun_fact = COALESCE(NULLIF(t.fun_fact, ''), r.fun_fact)
FROM rider_data r
WHERE LOWER(t.name) = r.name_match;


-- 4. Vérifications
SELECT name, role, LEFT(bio, 60) AS bio_preview
FROM public.team
ORDER BY sort_order;

-- Fin V17
