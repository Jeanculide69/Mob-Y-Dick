-- ==========================================
-- MIGRATION V11 : PREMIUM SHOP, PURCHASES & DONATIONS
-- Mob Y Dick — À exécuter dans Supabase SQL Editor
-- ==========================================

-- 1. Table des items premium (emotes/sons)
CREATE TABLE IF NOT EXISTS public.shop_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  type text NOT NULL CHECK (type IN ('emote', 'sound', 'emote_sound', 'pack')),
  price_cents integer NOT NULL,        -- Prix en centimes (ex: 300 pour 3.00€)
  emoji text,                          -- Emojis natifs associés (ex: '💩')
  animation_url text,                  -- GIF/WebP animé en overlay (ex: '/emotes/poop_anim.webp')
  sound_url text,                      -- Fichier audio MP3/WAV (ex: '/sounds/fart.mp3')
  pack_items text[],                   -- Si type='pack', liste des slugs inclus
  is_visible boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ajouter le champ paypal_order_id à la table orders existante pour les objets physiques
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paypal_order_id text;

-- Active RLS sur shop_items
ALTER TABLE public.shop_items ENABLE ROW LEVEL SECURITY;

-- Lecture publique pour tout le monde
CREATE POLICY "shop_items_read" ON public.shop_items FOR SELECT USING (true);

-- Modifications réservées aux admins
CREATE POLICY "shop_items_write" ON public.shop_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );


-- 2. Table des achats utilisateur
CREATE TABLE IF NOT EXISTS public.user_purchases (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  item_slug text NOT NULL,
  paypal_order_id text,
  amount_cents integer NOT NULL,
  purchased_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_id, item_slug)
);

-- Active RLS sur user_purchases
ALTER TABLE public.user_purchases ENABLE ROW LEVEL SECURITY;

-- Un utilisateur peut lire ses propres achats
CREATE POLICY "user_purchases_read_own" ON public.user_purchases
  FOR SELECT USING (auth.uid() = user_id);

-- Un utilisateur connecté peut enregistrer un achat pour lui-même (Option A : client-side insert)
CREATE POLICY "user_purchases_insert_own" ON public.user_purchases
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Les admins peuvent tout voir
CREATE POLICY "user_purchases_admin" ON public.user_purchases
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );


-- 3. Table des dons (SuperChat)
CREATE TABLE IF NOT EXISTS public.donations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  amount_cents integer NOT NULL,
  message text,
  session_id uuid REFERENCES public.race_sessions(id) ON DELETE SET NULL,
  paypal_order_id text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Active RLS sur donations
ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;

-- Tout le monde peut voir les dons (pour l'affichage en live)
CREATE POLICY "donations_read" ON public.donations FOR SELECT USING (true);

-- N'importe qui (anonyme ou connecté) peut enregistrer un don
CREATE POLICY "donations_insert" ON public.donations FOR INSERT WITH CHECK (true);

-- Suppression/Modification réservée aux admins
CREATE POLICY "donations_admin_all" ON public.donations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );


-- 4. Ajouter les tables au système de Realtime de Supabase
BEGIN;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.donations;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.user_purchases;
COMMIT;


-- 5. Remplir la base avec des emotes et sons de démonstration par défaut
INSERT INTO public.shop_items (slug, name, description, type, price_cents, emoji, animation_url, sound_url, sort_order)
VALUES 
  ('emote_poop', '💩 Emote Caca', 'Envoie un caca qui s''écrase au milieu de l''écran avec un bruit rigolo.', 'emote_sound', 300, '💩', 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3hmdWw1ZmlnYTh1eXVpazQ0Ymd0N29hMHl2Y3o3Zng3bzR3dnl4dyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9cw/WOBH1Z4y8S1c73v1d9/giphy.gif', 'https://www.soundjay.com/misc/sounds/fart-01.mp3', 1),
  ('emote_fart', '💨 Super Pet', 'Un nuage de fumée pétaradant qui traverse l''écran.', 'emote_sound', 300, '💨', 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExaG45cDQ4ZmhuOWlyOHB2YTZodDZtYXhuYXhrNXozYTh1eTNzOHpxNSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9cw/VfJ2Fq98J1YQv2t3hX/giphy.gif', 'https://www.soundjay.com/misc/sounds/fart-02.mp3', 2),
  ('sound_horn', '📯 Klaxon de Brêle', 'Fait retentir un vieux klaxon de mobylette pour encourager les riders.', 'sound', 200, '📯', NULL, 'https://www.soundjay.com/transportation/sounds/car-horn-3.mp3', 3),
  ('emote_clown', '🤡 Emote Clown', 'Affiche un clown rigolo en plein écran.', 'emote', 200, '🤡', 'https://media.giphy.com/media/x0npYExCGOZeo/giphy.gif', 'https://www.soundjay.com/misc/sounds/fail-buzzer-01.mp3', 4),
  ('emote_fire', '🔥 Flammes En Enfer', 'Inonde le live de flammes géantes.', 'emote', 300, '🔥', 'https://media.giphy.com/media/Lopx9eUi34rbq/giphy.gif', 'https://www.soundjay.com/nature/sounds/fire-1.mp3', 5)
ON CONFLICT (slug) DO NOTHING;

-- Créer le pack complet qui regroupe tout pour 30€
INSERT INTO public.shop_items (slug, name, description, type, price_cents, pack_items, sort_order)
VALUES 
  ('pack_premium_all', '🎁 Pack Ultimate Rider', 'Débloque TOUTES les emotes animées et TOUS les sons premium d''un coup ! (Économise plus de 20%)', 'pack', 3000, ARRAY['emote_poop', 'emote_fart', 'sound_horn', 'emote_clown', 'emote_fire'], 10)
ON CONFLICT (slug) DO NOTHING;
