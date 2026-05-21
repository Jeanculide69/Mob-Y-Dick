-- ============================================
-- V22 — Traçabilité enrichie des dons et achats
-- ============================================
-- Bascule de PayPal vers Stripe → on en profite pour ajouter les
-- champs qui manquent côté admin (email payeur, marque + 4 derniers
-- chiffres de la carte, URL du reçu Stripe, provider de paiement).
--
-- Ces colonnes sont remplies par l'Edge Function `stripe-donation`
-- lors de la finalisation. Aucune n'est obligatoire (les anciens
-- dons PayPal restent en place avec ces champs à NULL).
--
-- Idempotent.
-- ============================================


-- ─────────────────────────────────────────
-- 1. donations : nouvelles colonnes
-- ─────────────────────────────────────────
ALTER TABLE public.donations
  ADD COLUMN IF NOT EXISTS payment_provider text,         -- 'stripe' | 'paypal'
  ADD COLUMN IF NOT EXISTS payer_email text,              -- saisi par le donateur (optionnel)
  ADD COLUMN IF NOT EXISTS card_brand text,               -- 'visa', 'mastercard', 'amex'…
  ADD COLUMN IF NOT EXISTS card_last4 text,               -- 4 derniers chiffres
  ADD COLUMN IF NOT EXISTS receipt_url text;              -- URL du reçu Stripe

-- Pour les dons existants (PayPal), on tag le provider comme 'paypal'
-- quand le paypal_order_id ne commence pas par 'pi_' (= PaymentIntent
-- Stripe). Sinon stripe.
UPDATE public.donations
SET payment_provider = CASE
  WHEN paypal_order_id LIKE 'pi_%' THEN 'stripe'
  WHEN paypal_order_id IS NOT NULL THEN 'paypal'
  ELSE NULL
END
WHERE payment_provider IS NULL;


-- ─────────────────────────────────────────
-- 2. user_purchases : mêmes ajouts
-- ─────────────────────────────────────────
ALTER TABLE public.user_purchases
  ADD COLUMN IF NOT EXISTS payment_provider text,
  ADD COLUMN IF NOT EXISTS card_brand text,
  ADD COLUMN IF NOT EXISTS card_last4 text,
  ADD COLUMN IF NOT EXISTS receipt_url text;

UPDATE public.user_purchases
SET payment_provider = CASE
  WHEN paypal_order_id LIKE 'pi_%' THEN 'stripe'
  WHEN paypal_order_id IS NOT NULL THEN 'paypal'
  ELSE NULL
END
WHERE payment_provider IS NULL;


-- ─────────────────────────────────────────
-- 3. Email : longueur max + format simple
-- ─────────────────────────────────────────
-- Validation email côté DB (on n'a pas besoin d'une regex parfaite,
-- juste éviter les payloads abusifs). LENGTH ≤ 254 (RFC 5321), simple
-- CHECK presence du '@'.
ALTER TABLE public.donations
  DROP CONSTRAINT IF EXISTS donations_payer_email_format;
ALTER TABLE public.donations
  ADD CONSTRAINT donations_payer_email_format
    CHECK (
      payer_email IS NULL
      OR (LENGTH(payer_email) BETWEEN 3 AND 254 AND payer_email LIKE '%@%')
    );


-- ─────────────────────────────────────────
-- 4. Vérifications
-- ─────────────────────────────────────────
SELECT 'Colonnes donations' AS check, column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'donations'
    AND column_name IN ('payment_provider', 'payer_email', 'card_brand', 'card_last4', 'receipt_url')
  ORDER BY column_name;

SELECT 'Colonnes user_purchases' AS check, column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'user_purchases'
    AND column_name IN ('payment_provider', 'card_brand', 'card_last4', 'receipt_url')
  ORDER BY column_name;

-- Fin V22
