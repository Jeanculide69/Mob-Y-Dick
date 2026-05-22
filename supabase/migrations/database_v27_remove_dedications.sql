-- ============================================
-- V27 — Suppression de la catégorie "dedication"
-- ============================================
-- Retour utilisateur sur v26 : les 3 produits de dédicace (5/10/20€)
-- font doublon avec le sponsoring. On simplifie : seul le sponsoring
-- (bière 1€, bougie 2€, mélange 3€, huile 10€, pneu 30€) reste comme
-- chemin "achat avec pseudo + message custom lu par le bot".
--
-- Le flow utilisateur "comme avant" :
--   1. user clique sur "Bière 1€" (ou autre sponsor)
--   2. modal : pseudo + message custom + carte
--   3. à la confirmation, le bot lit le message à l'antenne
--
-- Idempotent.
-- ============================================


-- ─────────────────────────────────────────
-- 1. Supprimer les 3 produits de dédicace
-- ─────────────────────────────────────────
-- D'abord retirer les references éventuelles depuis user_purchases /
-- live_messages (item_slug pointe sur le slug mais c'est juste du
-- texte, pas une FK — donc on peut DELETE direct sans casser de FK,
-- mais on note pour l'historique admin).
DELETE FROM public.shop_items
  WHERE slug IN ('dedication_5', 'dedication_10', 'dedication_20');


-- ─────────────────────────────────────────
-- 2. Resserrer le CHECK constraint shop_items.category
-- ─────────────────────────────────────────
-- v26 autorisait 'emote' | 'dedication' | 'sponsoring'. On retire
-- 'dedication' du whitelist pour éviter qu'un futur insert ne le
-- recrée par erreur.
ALTER TABLE public.shop_items
  DROP CONSTRAINT IF EXISTS shop_items_category_chk;
ALTER TABLE public.shop_items
  ADD CONSTRAINT shop_items_category_chk
    CHECK (category IN ('emote', 'sponsoring'));


-- ─────────────────────────────────────────
-- 3. Vérifications
-- ─────────────────────────────────────────
SELECT 'Produits restants' AS check, slug, name, category, price_cents
  FROM public.shop_items
  WHERE category IN ('sponsoring')
  ORDER BY price_cents;

SELECT 'Categories autorisées' AS check, pg_get_constraintdef(oid) AS def
  FROM pg_constraint
  WHERE conname = 'shop_items_category_chk';

-- Fin V27
