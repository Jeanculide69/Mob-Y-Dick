-- ============================================
-- V24 — Idempotence des commandes (orders)
-- ============================================
-- v20 a ajouté UNIQUE(paypal_order_id) sur donations + user_purchases pour
-- protéger des doublons sur retry réseau. Mais la table `orders` est passée
-- au travers — conséquence : un retry de l'action finalize-order (ou un
-- webhook Stripe qui arrive en parallèle d'un finalize client) crée une
-- 2e ligne `orders` avec le même payment_intent_id, sans erreur.
--
-- Le code TS de stripe-donation checke déjà `error.code === '23505'` pour
-- traiter le retry comme idempotent ; il manque juste la contrainte côté DB.
--
-- WHERE paypal_order_id IS NOT NULL : compat ascendante. Les orders pré-V11
-- pouvaient avoir ce champ NULL. Cette contrainte partielle laisse passer
-- les NULL tout en empêchant les doublons sur les valeurs renseignées.
--
-- Idempotent.
-- ============================================


-- ─────────────────────────────────────────
-- 1. UNIQUE partiel sur orders.paypal_order_id
-- ─────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS orders_paypal_order_unique
  ON public.orders (paypal_order_id)
  WHERE paypal_order_id IS NOT NULL;


-- ─────────────────────────────────────────
-- 2. Vérification
-- ─────────────────────────────────────────
SELECT 'Index orders.paypal_order_id' AS check, indexname, indexdef
  FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'orders' AND indexname = 'orders_paypal_order_unique';

-- Fin V24
