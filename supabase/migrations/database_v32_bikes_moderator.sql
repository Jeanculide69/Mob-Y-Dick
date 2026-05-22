-- ============================================
-- V32 — Table bikes : structure stable + RLS modérateur
-- ============================================
-- Avant V32 :
--   * Aucune migration ne créait la table `bikes`. Elle a probablement été
--     créée à la main via Supabase Studio sans contrainte UNIQUE.
--   * Le front identifie chaque moto par son sort_order (0=rouge, 1=orange,
--     2=noir) — sans UNIQUE, le UPSERT ne peut pas garantir l'unicité.
--   * RLS bikes_update = is_user_admin() → modérateurs bloqués.
--
-- Cette migration :
--   1. CREATE TABLE IF NOT EXISTS bikes (idempotent, n'écrase pas l'existant)
--   2. Ajoute la contrainte UNIQUE sur sort_order (clé fonctionnelle stable)
--   3. Seed les 3 motos par défaut si elles n'existent pas (rouge/orange/noir)
--   4. Ouvre INSERT + UPDATE aux modérateurs. DELETE reste admin.
-- ============================================

-- ─── 0. Extension pgcrypto (pour gen_random_uuid) ───
-- Habituellement déjà activée sur Supabase, mais on s'assure.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── 1. Schéma de la table ─────────────────────
CREATE TABLE IF NOT EXISTS public.bikes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  plate text,
  description text,
  images text,             -- URLs séparées par des virgules
  specs jsonb DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL,
  created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ─── 1.bis Si la table existait déjà sans DEFAULT sur id ───
-- (cas réel détecté : table créée manuellement via Studio sans préciser
-- de default → INSERT sans id → null violates not-null constraint).
ALTER TABLE public.bikes ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- ─── 2. UNIQUE sort_order ──────────────────────
-- Permet aux UPSERT côté front d'utiliser sort_order comme clé stable
-- (l'UUID change à chaque réinsertion, sort_order non).
ALTER TABLE public.bikes
  DROP CONSTRAINT IF EXISTS bikes_sort_order_unique;
ALTER TABLE public.bikes
  ADD CONSTRAINT bikes_sort_order_unique UNIQUE (sort_order);

-- ─── 3. Seed initial (rouge / orange / noir) ───
-- Insère uniquement si le sort_order correspondant n'existe pas déjà.
-- Si l'admin a déjà customisé une moto, on ne touche à rien.
-- On force gen_random_uuid() explicitement (belt & suspenders) au cas où
-- le ALTER ci-dessus n'aurait pas le temps d'être visible dans la même
-- transaction sur certaines configs.
INSERT INTO public.bikes (id, title, plate, description, images, specs, sort_order)
SELECT
  gen_random_uuid(),
  'La Bête Rouge – Beast R-1',
  'N° 1',
  'Conçue pour dompter la poussière et les terrains les plus extrêmes, la Bête Rouge est une véritable icône de puissance.',
  '/motos/2cd0ab6d-2472-4496-aac8-af9a290fbf14.jpg,/motos/6c3be747-ab9a-4ae3-8414-d6e23a6698fe.jpg,/motos/9ee5fac2-769a-461d-9f22-936c44a2b717.jpg,/motos/f5def3ab-7a3e-4eb4-85fc-1bd659ef0ea9.jpg',
  '{"Cylindrée":"125 cc 2-Temps","Suspensions":"Fourche inversée réglable","Échappement":"Ligne FMF Gold Series","Freinage":"Disques hydrauliques ventilés","Poids à vide":"88 kg","Pneus":"Michelin StarCross 5"}'::jsonb,
  0
WHERE NOT EXISTS (SELECT 1 FROM public.bikes WHERE sort_order = 0);

INSERT INTO public.bikes (id, title, plate, description, images, specs, sort_order)
SELECT
  gen_random_uuid(),
  'L''Étincelle Orange – Storm O-4',
  'N° 4',
  'L''Étincelle Orange ne passe jamais inaperçue. Conçue spécialement pour le stunt et le motocross freestyle.',
  '/motos/05c88f5e-250c-41fa-bdc4-dc97b785cd54.jpg,/motos/5bebfecf-6fbf-4327-a6ec-59df4de8dffd.jpg,/motos/c2b259ef-7132-42f1-bbe6-225949254c2a.jpg,/motos/e551714e-aa71-4599-9f6c-bcdea4e944b1.jpg',
  '{"Cylindrée":"150 cc Haute-Compression","Suspensions":"Monoamortisseur WP Pro","Échappement":"Silencieux Akrapovič Custom","Guidon":"Guidon Renthal Fatbar","Poids à vide":"91 kg","Pneus":"Pirelli Scorpion MX"}'::jsonb,
  1
WHERE NOT EXISTS (SELECT 1 FROM public.bikes WHERE sort_order = 1);

INSERT INTO public.bikes (id, title, plate, description, images, specs, sort_order)
SELECT
  gen_random_uuid(),
  'L''Ombre Noire – Stealth N-67',
  'N° 67',
  'Sombre, furtive et d''une élégance redoutable, l''Ombre Noire est bâtie pour la performance en toute discrétion.',
  '/motos/5e66cf75-e1de-41d7-8273-ed89eb9c8e3e.jpg,/motos/6fae5df4-0ec9-4e66-ba64-885a453960df.jpg,/motos/a5956043-1e5b-454c-82e1-db0afdad9d99.jpg,/motos/cfc2f2d9-647f-40f1-97bf-bc5e90eb423f.jpg',
  '{"Cylindrée":"250 cc 4-Temps Injection","Suspensions":"Showa SFF-Air TAC","Échappement":"Double sortie Yoshimura Carbon","Jantes":"Excel A60 noires renforcées","Poids à vide":"98 kg","Pneus":"Dunlop Geomax MX33"}'::jsonb,
  2
WHERE NOT EXISTS (SELECT 1 FROM public.bikes WHERE sort_order = 2);

-- ─── 4. RLS : ouvrir INSERT + UPDATE aux modérateurs ───
-- Reprend le pattern V19 (team) pour bikes.
-- Helper public.is_user_admin_or_moderator() défini en V19 (ré-affirmé ici
-- au cas où la base n'aurait pas été migrée).
CREATE OR REPLACE FUNCTION public.is_user_admin_or_moderator()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'moderator')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

ALTER TABLE public.bikes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bikes_read"   ON public.bikes;
DROP POLICY IF EXISTS "bikes_insert" ON public.bikes;
DROP POLICY IF EXISTS "bikes_update" ON public.bikes;
DROP POLICY IF EXISTS "bikes_delete" ON public.bikes;

CREATE POLICY "bikes_read"   ON public.bikes FOR SELECT USING (true);
CREATE POLICY "bikes_insert" ON public.bikes FOR INSERT WITH CHECK (public.is_user_admin_or_moderator());
CREATE POLICY "bikes_update" ON public.bikes FOR UPDATE USING (public.is_user_admin_or_moderator());
CREATE POLICY "bikes_delete" ON public.bikes FOR DELETE USING (public.is_user_admin());  -- destructif → admin only

-- ─── 5. Vérification ───────────────────────────
SELECT 'bikes rows' AS check, count(*) AS rows FROM public.bikes;
SELECT 'bikes policies' AS check, polname, polcmd
  FROM pg_policy WHERE polrelid = 'public.bikes'::regclass ORDER BY polname;

-- Fin V32
