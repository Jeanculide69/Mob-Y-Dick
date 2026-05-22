-- ==========================================
-- MIGRATION V8 : VERROUILLAGE COMPLET (plus de cadenas ouverts)
-- Mob Y Dick — À exécuter dans Supabase SQL Editor
-- ==========================================
--
-- Cette migration ferme les derniers trous de sécurité identifiés
-- dans l'audit des rôles :
--   1. gallery : ecriture admin+moderator (avant : tout user connecté)
--   2. team    : ecriture admin (avant : non vérifiée)
--   3. bikes   : ecriture admin (avant : non vérifiée)
--   4. settings: ecriture admin (avant : non vérifiée)
--   5. orders  : lecture admin+ proprietaire / écriture admin /
--                INSERT anonyme autorise (checkout sans compte)
--   6. sponsors: lecture admin / écriture admin /
--                INSERT anonyme autorise (formulaire public)
--   7. profiles: trigger qui empeche un user de modifier son propre
--                role ou ses permissions (auto-promotion admin)
--
-- Idempotent : tu peux relancer sans risque.
-- ==========================================


-- ─────────────────────────────────────────
-- 0. Helpers (auto-cree si absent — rend V8 autonome)
-- ─────────────────────────────────────────
-- is_user_admin() : doit deja exister (cree en database_setup.sql).
-- is_user_race_manager() : doit deja exister (cree en V3).
-- is_user_admin_or_moderator() : cree en V6 ; on le redefinit ici au
-- cas ou V6 n'aurait pas ete applique.
CREATE OR REPLACE FUNCTION public.is_user_admin_or_moderator()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'moderator')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Filet de securite : meme chose pour is_user_race_manager() au cas ou
-- V3 n'aurait pas tourne.
CREATE OR REPLACE FUNCTION public.is_user_race_manager()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'organisateur')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Et pour is_user_admin() (database_setup.sql) pour etre vraiment sur
CREATE OR REPLACE FUNCTION public.is_user_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;


-- ─────────────────────────────────────────
-- 1. GALLERY : admin + moderator
-- ─────────────────────────────────────────
ALTER TABLE public.gallery ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read gallery" ON public.gallery;
DROP POLICY IF EXISTS "Auth insert gallery" ON public.gallery;
DROP POLICY IF EXISTS "Auth update gallery" ON public.gallery;
DROP POLICY IF EXISTS "Auth delete gallery" ON public.gallery;
DROP POLICY IF EXISTS "gallery_read" ON public.gallery;
DROP POLICY IF EXISTS "gallery_insert" ON public.gallery;
DROP POLICY IF EXISTS "gallery_update" ON public.gallery;
DROP POLICY IF EXISTS "gallery_delete" ON public.gallery;

CREATE POLICY "gallery_read" ON public.gallery FOR SELECT USING (true);
CREATE POLICY "gallery_insert" ON public.gallery FOR INSERT WITH CHECK (public.is_user_admin_or_moderator());
CREATE POLICY "gallery_update" ON public.gallery FOR UPDATE USING (public.is_user_admin_or_moderator());
CREATE POLICY "gallery_delete" ON public.gallery FOR DELETE USING (public.is_user_admin_or_moderator());


-- ─────────────────────────────────────────
-- 2. TEAM : admin uniquement
-- ─────────────────────────────────────────
ALTER TABLE public.team ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_read" ON public.team;
DROP POLICY IF EXISTS "team_insert" ON public.team;
DROP POLICY IF EXISTS "team_update" ON public.team;
DROP POLICY IF EXISTS "team_delete" ON public.team;

CREATE POLICY "team_read" ON public.team FOR SELECT USING (true);
CREATE POLICY "team_insert" ON public.team FOR INSERT WITH CHECK (public.is_user_admin());
CREATE POLICY "team_update" ON public.team FOR UPDATE USING (public.is_user_admin());
CREATE POLICY "team_delete" ON public.team FOR DELETE USING (public.is_user_admin());


-- ─────────────────────────────────────────
-- 3. BIKES : admin uniquement
-- ─────────────────────────────────────────
ALTER TABLE public.bikes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bikes_read" ON public.bikes;
DROP POLICY IF EXISTS "bikes_insert" ON public.bikes;
DROP POLICY IF EXISTS "bikes_update" ON public.bikes;
DROP POLICY IF EXISTS "bikes_delete" ON public.bikes;

CREATE POLICY "bikes_read" ON public.bikes FOR SELECT USING (true);
CREATE POLICY "bikes_insert" ON public.bikes FOR INSERT WITH CHECK (public.is_user_admin());
CREATE POLICY "bikes_update" ON public.bikes FOR UPDATE USING (public.is_user_admin());
CREATE POLICY "bikes_delete" ON public.bikes FOR DELETE USING (public.is_user_admin());


-- ─────────────────────────────────────────
-- 4. SETTINGS : admin uniquement
-- ─────────────────────────────────────────
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settings_read" ON public.settings;
DROP POLICY IF EXISTS "settings_insert" ON public.settings;
DROP POLICY IF EXISTS "settings_update" ON public.settings;
DROP POLICY IF EXISTS "settings_delete" ON public.settings;

CREATE POLICY "settings_read" ON public.settings FOR SELECT USING (true);
CREATE POLICY "settings_insert" ON public.settings FOR INSERT WITH CHECK (public.is_user_admin());
CREATE POLICY "settings_update" ON public.settings FOR UPDATE USING (public.is_user_admin());
CREATE POLICY "settings_delete" ON public.settings FOR DELETE USING (public.is_user_admin());


-- ─────────────────────────────────────────
-- 5. ORDERS : INSERT anonyme (checkout sans compte) + lecture/gestion admin
--    Les utilisateurs connectes peuvent aussi voir leurs propres commandes.
-- ─────────────────────────────────────────
-- S'assurer que la colonne user_id existe (le code App.jsx la set deja
-- depuis longtemps, mais elle n'avait jamais ete ajoutee a la table).
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_read" ON public.orders;
DROP POLICY IF EXISTS "orders_insert" ON public.orders;
DROP POLICY IF EXISTS "orders_update" ON public.orders;
DROP POLICY IF EXISTS "orders_delete" ON public.orders;

-- Lecture : admin OU proprietaire (user_id = auth.uid())
CREATE POLICY "orders_read" ON public.orders
  FOR SELECT
  USING (
    public.is_user_admin()
    OR (auth.uid() IS NOT NULL AND user_id = auth.uid())
  );

-- INSERT : tout le monde (anonyme ou connecte) peut passer commande
CREATE POLICY "orders_insert" ON public.orders
  FOR INSERT
  WITH CHECK (true);

-- UPDATE / DELETE : admin uniquement
CREATE POLICY "orders_update" ON public.orders FOR UPDATE USING (public.is_user_admin());
CREATE POLICY "orders_delete" ON public.orders FOR DELETE USING (public.is_user_admin());


-- ─────────────────────────────────────────
-- 6. SPONSORS : INSERT anonyme (formulaire public) + lecture/gestion admin
-- ─────────────────────────────────────────
ALTER TABLE public.sponsors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sponsors_read" ON public.sponsors;
DROP POLICY IF EXISTS "sponsors_insert" ON public.sponsors;
DROP POLICY IF EXISTS "sponsors_update" ON public.sponsors;
DROP POLICY IF EXISTS "sponsors_delete" ON public.sponsors;

-- Lecture : admin uniquement (donnees commerciales sensibles)
CREATE POLICY "sponsors_read" ON public.sponsors FOR SELECT USING (public.is_user_admin());

-- INSERT : tout le monde peut soumettre une proposition de sponsoring
CREATE POLICY "sponsors_insert" ON public.sponsors FOR INSERT WITH CHECK (true);

-- UPDATE / DELETE : admin uniquement
CREATE POLICY "sponsors_update" ON public.sponsors FOR UPDATE USING (public.is_user_admin());
CREATE POLICY "sponsors_delete" ON public.sponsors FOR DELETE USING (public.is_user_admin());


-- ─────────────────────────────────────────
-- 7. PROFILES : empecher l'auto-promotion admin via UPDATE direct
--    Avant : un user pouvait UPDATE son propre profil et changer
--            n'importe quelle colonne, y compris role et permissions.
--    Apres : trigger BEFORE UPDATE qui rejette tout changement de
--            role ou permissions sauf si l'auteur de la modif est
--            deja admin.
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_self_role_escalation()
RETURNS trigger AS $$
BEGIN
  -- Si role ou permissions changent et que l'auteur n'est pas admin, on bloque
  IF (NEW.role IS DISTINCT FROM OLD.role
      OR NEW.permissions IS DISTINCT FROM OLD.permissions)
     AND NOT public.is_user_admin() THEN
    RAISE EXCEPTION 'Seul un administrateur peut modifier le role ou les permissions.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS prevent_self_role_escalation_trigger ON public.profiles;
CREATE TRIGGER prevent_self_role_escalation_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_self_role_escalation();


-- ─────────────────────────────────────────
-- 8. Verifications globales
-- ─────────────────────────────────────────
SELECT 'RLS actif' AS check, relname,
       CASE WHEN relrowsecurity THEN '✅' ELSE '❌' END AS status
  FROM pg_class
  WHERE relname IN ('gallery','team','bikes','settings','orders','sponsors','profiles','products','events','race_sessions','race_teams','race_laps')
    AND relnamespace = 'public'::regnamespace
  ORDER BY relname;

SELECT 'Trigger profiles' AS check, tgname, tgenabled
  FROM pg_trigger
  WHERE tgname = 'prevent_self_role_escalation_trigger';

-- Fin V8 — Plus de cadenas ouverts 🔒
