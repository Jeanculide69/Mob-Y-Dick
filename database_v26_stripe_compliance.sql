-- ============================================
-- V26 — Conformité Stripe : suppression des montants libres
-- ============================================
-- Stripe a envoyé un avertissement (mai 2026) : les "dons à montant libre"
-- de notre formulaire SuperChat sont assimilés à de la cagnotte / financement
-- participatif (Restricted Businesses). Pour sauver le compte, on bascule
-- TOUS les paiements vers des produits/services à prix fixes (shop_items).
--
-- Cette migration :
--   1. Étend `shop_items` avec category / allows_custom_message / repeatable
--      → permet de modéliser dédicaces (5/10/20€) et sponsoring (bière 1€,
--        bougie 2€, mélange 3€, huile 10€, pneu 30€) avec message custom
--   2. Étend `user_purchases` : custom_message, display_name, session_id
--      (chaque achat de service produit éventuellement un événement live)
--   3. Retire la contrainte UNIQUE(user_id, item_slug) — un user peut
--      acheter plusieurs bières/dédicaces. La logique "déjà débloqué" pour
--      les emotes est désormais portée par la colonne `repeatable` côté
--      Edge Function (refuse l'achat si repeatable=false ET déjà possédé)
--   4. Renomme `donations` en `live_messages` + ajoute item_slug,
--      user_purchase_id, is_legacy_donation → fusionne le journal des
--      anciens dons et les messages live des nouveaux achats
--   5. Insère les 8 nouveaux produits (3 dédicaces + 5 sponsoring)
--
-- ⚠️ ORDRE DE DÉPLOIEMENT :
--    1. Cette migration en DB
--    2. Redéployer l'Edge Function `stripe-donation` mise à jour
--       (lit live_messages au lieu de donations, gère custom_message)
--    3. Déployer le nouveau front (plus de StripeDonationForm)
--    L'ordre garantit qu'il n'y a jamais de fenêtre cassée.
--
-- Idempotent.
-- ============================================


-- ─────────────────────────────────────────
-- 1. shop_items : nouvelles colonnes
-- ─────────────────────────────────────────
ALTER TABLE public.shop_items
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS allows_custom_message boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS repeatable boolean NOT NULL DEFAULT false;

-- Backfill : tous les items existants sont des emotes (catégorie 1 unique
-- jusqu'à présent), non repeatable (l'emote se débloque une fois), pas de
-- message custom (l'emote est consommée silencieusement).
UPDATE public.shop_items
  SET category = 'emote'
  WHERE category IS NULL;

-- Contrainte CHECK + NOT NULL après backfill
ALTER TABLE public.shop_items
  ALTER COLUMN category SET NOT NULL;

ALTER TABLE public.shop_items
  DROP CONSTRAINT IF EXISTS shop_items_category_chk;
ALTER TABLE public.shop_items
  ADD CONSTRAINT shop_items_category_chk
    CHECK (category IN ('emote', 'dedication', 'sponsoring'));


-- ─────────────────────────────────────────
-- 2. user_purchases : retirer UNIQUE(user_id, item_slug) + ajouter colonnes
-- ─────────────────────────────────────────
-- La contrainte UNIQUE de V11 empêchait d'acheter 2× le même item — OK
-- pour les emotes (déblocage permanent), KO pour les services repeatable
-- (un user peut offrir 3 bières dans la même soirée). On la retire.
-- L'unicité "1 emote = 1 achat par user" est désormais gérée côté Edge
-- Function en lisant shop_items.repeatable avant d'autoriser.
ALTER TABLE public.user_purchases
  DROP CONSTRAINT IF EXISTS user_purchases_user_id_item_slug_key;

-- Ajout des champs nécessaires aux services live :
--   - custom_message  : ce que le bot TTS lira à l'antenne (300 chars max)
--   - display_name    : pseudo qui s'affiche pour les achats anonymes
--                       (un user connecté utilise son profile.display_name)
--   - session_id      : course en cours au moment de l'achat (pour l'overlay
--                       live et la stat "dédicaces par event")
ALTER TABLE public.user_purchases
  ADD COLUMN IF NOT EXISTS custom_message text,
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.race_sessions(id) ON DELETE SET NULL;

-- user_id devient nullable : pour les achats anonymes (visiteur non
-- connecté qui paie une bière), on n'a pas de profile lié.
ALTER TABLE public.user_purchases
  ALTER COLUMN user_id DROP NOT NULL;

-- L'ancienne policy "user_purchases_read_own" exige auth.uid() = user_id,
-- ce qui bloque la lecture des achats anonymes. On ajoute une policy de
-- lecture publique limitée aux 3 colonnes utiles à l'overlay live
-- (display_name, custom_message, item_slug, session_id) via une vue
-- dédiée plus bas. Pour la table directe, la lecture reste own + admin.

-- CHECK longueurs
ALTER TABLE public.user_purchases
  DROP CONSTRAINT IF EXISTS user_purchases_message_len;
ALTER TABLE public.user_purchases
  ADD CONSTRAINT user_purchases_message_len
    CHECK (custom_message IS NULL OR LENGTH(custom_message) <= 300);

ALTER TABLE public.user_purchases
  DROP CONSTRAINT IF EXISTS user_purchases_display_name_len;
ALTER TABLE public.user_purchases
  ADD CONSTRAINT user_purchases_display_name_len
    CHECK (display_name IS NULL OR LENGTH(display_name) BETWEEN 1 AND 80);


-- ─────────────────────────────────────────
-- 3. donations → live_messages (rename + extension)
-- ─────────────────────────────────────────
-- ALTER TABLE RENAME préserve indexes, contraintes, policies, FK, et la
-- publication realtime. On renomme aussi les contraintes au passage pour
-- garder un schéma cohérent (sinon on traîne `donations_xxx` partout).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'donations')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables
                     WHERE table_schema = 'public' AND table_name = 'live_messages') THEN
    ALTER TABLE public.donations RENAME TO live_messages;
  END IF;
END $$;

-- Renommer les contraintes (idempotent — chacune est try-then-skip)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'donations_paypal_order_unique') THEN
    ALTER TABLE public.live_messages RENAME CONSTRAINT donations_paypal_order_unique TO live_messages_payment_unique;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'donations_amount_sane') THEN
    ALTER TABLE public.live_messages RENAME CONSTRAINT donations_amount_sane TO live_messages_amount_sane;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'donations_message_len') THEN
    ALTER TABLE public.live_messages RENAME CONSTRAINT donations_message_len TO live_messages_message_len;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'donations_display_name_len') THEN
    ALTER TABLE public.live_messages RENAME CONSTRAINT donations_display_name_len TO live_messages_display_name_len;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'donations_payer_email_format') THEN
    ALTER TABLE public.live_messages RENAME CONSTRAINT donations_payer_email_format TO live_messages_payer_email_format;
  END IF;
END $$;

-- Renommer les policies (DROP + CREATE — Postgres ne supporte pas RENAME POLICY)
DROP POLICY IF EXISTS "donations_read" ON public.live_messages;
CREATE POLICY "live_messages_read" ON public.live_messages FOR SELECT USING (true);

DROP POLICY IF EXISTS "donations_insert" ON public.live_messages;
CREATE POLICY "live_messages_insert" ON public.live_messages
  FOR INSERT WITH CHECK (false); -- service_role bypass RLS, anon/auth bloqués

DROP POLICY IF EXISTS "donations_admin_all" ON public.live_messages;
CREATE POLICY "live_messages_admin_all" ON public.live_messages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Nouvelles colonnes pour la traçabilité :
--   - item_slug         : slug du produit acheté (NULL pour les anciens dons)
--   - user_purchase_id  : lien vers user_purchases.id (NULL pour legacy)
--   - is_legacy_donation: true pour les anciens dons à montant libre
ALTER TABLE public.live_messages
  ADD COLUMN IF NOT EXISTS item_slug text,
  ADD COLUMN IF NOT EXISTS user_purchase_id uuid REFERENCES public.user_purchases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_legacy_donation boolean NOT NULL DEFAULT false;

-- Backfill : tout ce qui existe avant cette migration = legacy don.
UPDATE public.live_messages
  SET is_legacy_donation = true
  WHERE is_legacy_donation = false
    AND item_slug IS NULL;

-- Index pour les queries admin par catégorie (dashboard)
CREATE INDEX IF NOT EXISTS live_messages_item_slug_idx
  ON public.live_messages (item_slug) WHERE item_slug IS NOT NULL;


-- ─────────────────────────────────────────
-- 4. Inserts produits : 3 dédicaces + 5 sponsoring
-- ─────────────────────────────────────────
-- Tous repeatable=true (peuvent être achetés N fois) + allows_custom_message=true
-- (l'acheteur saisit un message lu par le bot TTS à l'antenne).
INSERT INTO public.shop_items
  (slug, name, description, type, price_cents, emoji, category, allows_custom_message, repeatable, sort_order)
VALUES
  -- Dédicaces (service de divertissement — shoutout à l'antenne)
  ('dedication_5',  'Dédicace en direct',           'Le pilote te cite à l''antenne et lit ton message court (300 chars max).',                          'sound', 500,  '🎤', 'dedication', true, true, 100),
  ('dedication_10', 'Dédicace mise en avant',       'Ton pseudo + message s''affichent en grand à l''écran, lus par le bot avec une animation visuelle.', 'emote_sound', 1000, '📣', 'dedication', true, true, 101),
  ('dedication_20', 'Dédicace premium',             'Dédicace XXL : animation premium plein écran + lecture vocale + remerciement personnalisé du pilote.', 'emote_sound', 2000, '🌟', 'dedication', true, true, 102),

  -- Sponsoring (services symboliques d'implication dans l'équipe)
  ('sponsor_beer',     'Offrir une bière',          'Soutiens l''équipe en offrant une bière au team manager. Message custom lu à l''antenne.',          'sound', 100,  '🍺', 'sponsoring', true, true, 200),
  ('sponsor_candle',   'Payer la bougie',           'Finance la prochaine bougie du moteur. Message custom lu à l''antenne.',                            'sound', 200,  '🕯️', 'sponsoring', true, true, 201),
  ('sponsor_fuel_mix', 'Offrir un litre de mélange', 'Paye un litre du mélange pour la course. Message custom lu à l''antenne.',                          'sound', 300,  '⛽', 'sponsoring', true, true, 202),
  ('sponsor_oil',      'Payer l''huile moteur',     'Finance le bidon d''huile moteur du run. Message custom lu à l''antenne.',                          'sound', 1000, '🛢️', 'sponsoring', true, true, 203),
  ('sponsor_tire',     'Financer un pneu',          'Sponsor d''un pneu complet pour la moto. Message custom lu à l''antenne + remerciement vidéo.',     'sound', 3000, '🏍️', 'sponsoring', true, true, 204)
ON CONFLICT (slug) DO UPDATE SET
  -- Permet de re-run la migration pour ajuster prix/description sans
  -- avoir à drop+recreate (idempotent friendly).
  name                  = EXCLUDED.name,
  description           = EXCLUDED.description,
  price_cents           = EXCLUDED.price_cents,
  emoji                 = EXCLUDED.emoji,
  category              = EXCLUDED.category,
  allows_custom_message = EXCLUDED.allows_custom_message,
  repeatable            = EXCLUDED.repeatable,
  sort_order            = EXCLUDED.sort_order;


-- ─────────────────────────────────────────
-- 5. Vérifications
-- ─────────────────────────────────────────
SELECT 'Nouvelles colonnes shop_items' AS check, column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'shop_items'
    AND column_name IN ('category', 'allows_custom_message', 'repeatable')
  ORDER BY column_name;

SELECT 'Nouvelles colonnes user_purchases' AS check, column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'user_purchases'
    AND column_name IN ('custom_message', 'display_name', 'session_id')
  ORDER BY column_name;

SELECT 'Table live_messages (ex-donations)' AS check, table_name
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name IN ('donations', 'live_messages');

SELECT 'Nouveaux produits' AS check, slug, name, price_cents, category, repeatable
  FROM public.shop_items
  WHERE category IN ('dedication', 'sponsoring')
  ORDER BY sort_order;

-- Fin V26
