-- ==========================================
-- MIGRATION V6 : RLS PRODUITS (admin + moderator)
-- Mob Y Dick — À exécuter dans Supabase SQL Editor
-- ==========================================
--
-- Restreint la gestion des produits a admin OU moderator cote BDD,
-- en complement du gating UI hasPermission('manage_products').
--
-- Lecture : publique (tout visiteur peut voir la boutique).
-- Ecriture (INSERT/UPDATE/DELETE) : admin OU moderator uniquement.
--
-- Idempotent : tu peux relancer sans risque.
-- ==========================================


-- ─────────────────────────────────────────
-- 1. S'assurer que RLS est active sur products
-- ─────────────────────────────────────────
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────
-- 2. Helper : is admin OR moderator
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_user_admin_or_moderator()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'moderator')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;


-- ─────────────────────────────────────────
-- 3. Policies produits
-- ─────────────────────────────────────────
DROP POLICY IF EXISTS "products_read" ON public.products;
DROP POLICY IF EXISTS "products_insert" ON public.products;
DROP POLICY IF EXISTS "products_update" ON public.products;
DROP POLICY IF EXISTS "products_delete" ON public.products;
-- Cleanup d'anciennes policies eventuellement creees a la main
DROP POLICY IF EXISTS "Auth insert products" ON public.products;
DROP POLICY IF EXISTS "Auth update products" ON public.products;
DROP POLICY IF EXISTS "Auth delete products" ON public.products;
DROP POLICY IF EXISTS "Public read products" ON public.products;

-- Lecture publique
CREATE POLICY "products_read" ON public.products
  FOR SELECT
  USING (true);

-- INSERT : admin OU moderator
CREATE POLICY "products_insert" ON public.products
  FOR INSERT
  WITH CHECK (public.is_user_admin_or_moderator());

-- UPDATE : admin OU moderator
CREATE POLICY "products_update" ON public.products
  FOR UPDATE
  USING (public.is_user_admin_or_moderator());

-- DELETE : admin OU moderator
CREATE POLICY "products_delete" ON public.products
  FOR DELETE
  USING (public.is_user_admin_or_moderator());


-- ─────────────────────────────────────────
-- 4. Verifications
-- ─────────────────────────────────────────
SELECT 'RLS products' AS check, relname,
       CASE WHEN relrowsecurity THEN '✅ active' ELSE '❌ inactive' END AS status
  FROM pg_class
  WHERE relname = 'products' AND relnamespace = 'public'::regnamespace;

SELECT 'Policies products' AS check, policyname, cmd
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'products'
  ORDER BY cmd;

-- Fin V6
