-- ============================================
-- V21 — Verrouillage RLS donations + user_purchases
-- ============================================
-- ⚠️ À EXÉCUTER UNIQUEMENT APRÈS DÉPLOIEMENT de l'Edge Function
--    `verify-paypal-order` ET après mise à jour du front qui l'appelle
--    via supabase.functions.invoke(). Avant ça, exécuter cette migration
--    cassera tous les nouveaux dons et achats premium.
--
-- Objectif : retirer les `WITH CHECK (true)` et `WITH CHECK (auth.uid())`
-- qui permettaient à n'importe quel client d'insérer dans donations /
-- user_purchases sans vérification PayPal. À la place, seule la function
-- Edge (qui utilise service_role, lequel BYPASS RLS) peut insérer après
-- avoir vérifié le paiement auprès de l'API PayPal.
--
-- Lecture publique : on garde le SELECT public sur donations (pour
-- l'overlay live + admin) et SELECT own/admin sur user_purchases.
--
-- Idempotent.
-- ============================================


-- ─────────────────────────────────────────
-- 1. DONATIONS : INSERT verrouillé au service_role
-- ─────────────────────────────────────────
DROP POLICY IF EXISTS "donations_insert" ON public.donations;
-- Note : `WITH CHECK (false)` bloque les inserts via clés anon/auth.
-- Le service_role bypasse les RLS de toute façon, donc l'Edge Function
-- continue de pouvoir insérer.
CREATE POLICY "donations_insert" ON public.donations
  FOR INSERT WITH CHECK (false);


-- ─────────────────────────────────────────
-- 2. USER_PURCHASES : INSERT verrouillé au service_role
-- ─────────────────────────────────────────
DROP POLICY IF EXISTS "user_purchases_insert_own" ON public.user_purchases;
CREATE POLICY "user_purchases_insert_own" ON public.user_purchases
  FOR INSERT WITH CHECK (false);


-- ─────────────────────────────────────────
-- 3. Exception admin : UserManagement.handleTogglePremiumItem
--    fait un INSERT direct dans user_purchases avec amount=0 pour
--    attribuer un item premium à un user. C'est légitime (action admin
--    explicite), on l'autorise via une policy admin séparée.
-- ─────────────────────────────────────────
DROP POLICY IF EXISTS "user_purchases_admin_insert" ON public.user_purchases;
CREATE POLICY "user_purchases_admin_insert" ON public.user_purchases
  FOR INSERT WITH CHECK (public.is_user_admin());


-- ─────────────────────────────────────────
-- 4. Vérifications
-- ─────────────────────────────────────────
SELECT 'Policies INSERT' AS check, tablename, policyname, cmd
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('donations', 'user_purchases')
    AND cmd = 'INSERT'
  ORDER BY tablename, policyname;

-- Fin V21
