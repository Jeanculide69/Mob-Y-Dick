-- ============================================
-- V20 — Hardening sécurité : paiements, spam, longueurs
-- ============================================
-- Cette migration corrige les trous identifiés à l'audit :
--
--   1. donations / user_purchases : UNIQUE (paypal_order_id) → empêche
--      les doublons en cas de retry réseau ou attaque replay
--   2. donations / user_purchases : CHECK sur amount_cents (>0 + plafond)
--   3. Longueurs textes : CHECK LENGTH() sur messages, commentaires,
--      pseudos, descriptions → empêche les payloads abusifs (100 KB de
--      texte dans une alerte donation par exemple)
--   4. Rate-limit chat & photo_comments : trigger qui compte les inserts
--      récents de auth.uid() et bloque si > N par fenêtre temporelle
--   5. team-assets bucket : retirer 'organisateur' du périmètre (legacy
--      copier-coller de V17, n'a aucun sens — l'orga gère les courses,
--      pas la team)
--
-- ⚠️ NOTE IMPORTANTE — Sécurité PayPal :
--   Les CHECK/UNIQUE ci-dessous limitent les dégâts mais ne suffisent PAS
--   à empêcher un don/achat fictif. Pour bloquer vraiment, il faut une
--   Edge Function `verify-paypal-order` qui appelle l'API PayPal côté
--   serveur AVANT d'insérer. Voir supabase/functions/verify-paypal-order/.
--
--   Après déploiement de la function, exécuter v21 qui resserre les
--   policies donations/user_purchases pour n'autoriser QUE le service_role
--   (= l'Edge Function) à insérer. Côté client, supprimer les insert
--   directs et appeler la function.
--
-- Idempotent : ré-exécutable sans risque.
-- ============================================


-- ─────────────────────────────────────────
-- 1. UNIQUE paypal_order_id (anti-doublon)
-- ─────────────────────────────────────────
-- Donations : on autorise un seul don par ordre PayPal. Si client retry
-- en réseau pourri, la 2e insertion sera rejetée (= comportement attendu).
-- NULL autorisé pour les dons hors PayPal (ex: import manuel admin).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'donations_paypal_order_unique'
  ) THEN
    ALTER TABLE public.donations
      ADD CONSTRAINT donations_paypal_order_unique UNIQUE (paypal_order_id);
  END IF;
END $$;

-- User_purchases : pareil. Bonus, on a déjà UNIQUE(user_id, item_slug)
-- depuis V11 mais ça n'empêche pas le même order_id pour 2 items.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_purchases_paypal_order_unique'
  ) THEN
    ALTER TABLE public.user_purchases
      ADD CONSTRAINT user_purchases_paypal_order_unique UNIQUE (paypal_order_id);
  END IF;
END $$;


-- ─────────────────────────────────────────
-- 2. CHECK amount_cents : bornes raisonnables
-- ─────────────────────────────────────────
-- Pas de don ou achat à 0 ou négatif. Pas de don > 100 000 € (10 M cents)
-- — au-delà c'est sûrement de la fraude ou un bug arrondi.
ALTER TABLE public.donations
  DROP CONSTRAINT IF EXISTS donations_amount_sane;
ALTER TABLE public.donations
  ADD CONSTRAINT donations_amount_sane
    CHECK (amount_cents > 0 AND amount_cents <= 10000000);

-- Pour user_purchases on autorise 0 (admin attribue gratuitement via
-- l'UI UserManagement → handleTogglePremiumItem fait insert amount=0).
ALTER TABLE public.user_purchases
  DROP CONSTRAINT IF EXISTS user_purchases_amount_sane;
ALTER TABLE public.user_purchases
  ADD CONSTRAINT user_purchases_amount_sane
    CHECK (amount_cents >= 0 AND amount_cents <= 10000000);


-- ─────────────────────────────────────────
-- 3. CHECK longueurs texte (anti-payload abusif)
-- ─────────────────────────────────────────
-- Chat : 500 chars max par message
ALTER TABLE public.chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_len;
ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_len
    CHECK (LENGTH(message) BETWEEN 1 AND 500);

-- Commentaires photos : 1000 chars max
ALTER TABLE public.photo_comments
  DROP CONSTRAINT IF EXISTS photo_comments_len;
ALTER TABLE public.photo_comments
  ADD CONSTRAINT photo_comments_len
    CHECK (LENGTH(comment) BETWEEN 1 AND 1000);

-- Donations : message 300 chars (s'affiche en overlay live, plus court)
ALTER TABLE public.donations
  DROP CONSTRAINT IF EXISTS donations_message_len;
ALTER TABLE public.donations
  ADD CONSTRAINT donations_message_len
    CHECK (message IS NULL OR LENGTH(message) <= 300);

-- Donations : display_name 80 chars
ALTER TABLE public.donations
  DROP CONSTRAINT IF EXISTS donations_display_name_len;
ALTER TABLE public.donations
  ADD CONSTRAINT donations_display_name_len
    CHECK (LENGTH(display_name) BETWEEN 1 AND 80);

-- Profils : display_name 40 chars (cohérent avec les autres pseudos)
-- Note : on ne touche pas pending_display_name (la demande peut être
-- aussi longue, validée par admin via UserManagement)
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_display_name_len;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_display_name_len
    CHECK (display_name IS NULL OR LENGTH(display_name) BETWEEN 1 AND 40);


-- ─────────────────────────────────────────
-- 4. Rate-limit chat & photo_comments
-- ─────────────────────────────────────────
-- Trigger BEFORE INSERT qui rejette si l'utilisateur a déjà posté
-- plus de N messages dans les S dernières secondes.
--
-- Limits : 8 messages / 10 secondes (chat) — laisse poster une rafale
-- normale ("Allez les bleus !!!" + "Quel passage de fou !") mais bloque
-- les bots.
CREATE OR REPLACE FUNCTION public.check_chat_rate_limit()
RETURNS trigger AS $$
DECLARE
  recent_count integer;
BEGIN
  SELECT COUNT(*) INTO recent_count
  FROM public.chat_messages
  WHERE user_id = NEW.user_id
    AND created_at > (NOW() - INTERVAL '10 seconds');
  IF recent_count >= 8 THEN
    RAISE EXCEPTION 'Trop de messages d''un coup, attends quelques secondes.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS chat_rate_limit_trigger ON public.chat_messages;
CREATE TRIGGER chat_rate_limit_trigger
  BEFORE INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.check_chat_rate_limit();


-- Commentaires photos : 5 / 30s (plus rare qu'un chat live)
CREATE OR REPLACE FUNCTION public.check_photo_comment_rate_limit()
RETURNS trigger AS $$
DECLARE
  recent_count integer;
BEGIN
  SELECT COUNT(*) INTO recent_count
  FROM public.photo_comments
  WHERE user_id = NEW.user_id
    AND created_at > (NOW() - INTERVAL '30 seconds');
  IF recent_count >= 5 THEN
    RAISE EXCEPTION 'Trop de commentaires en peu de temps, ralentis.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS photo_comment_rate_limit_trigger ON public.photo_comments;
CREATE TRIGGER photo_comment_rate_limit_trigger
  BEFORE INSERT ON public.photo_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.check_photo_comment_rate_limit();


-- ─────────────────────────────────────────
-- 5. team-assets bucket : retirer 'organisateur'
-- ─────────────────────────────────────────
-- V17 autorisait admin/organisateur (copier-coller depuis race policies).
-- V19 a ajouté moderator. Maintenant on retire l'organisateur — pas son
-- périmètre.
DROP POLICY IF EXISTS "Admin upload team assets" ON storage.objects;
CREATE POLICY "Admin upload team assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'team-assets'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'moderator')
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
      AND role IN ('admin', 'moderator')
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
      AND role IN ('admin', 'moderator')
    )
  );


-- ─────────────────────────────────────────
-- 6. Vérifications
-- ─────────────────────────────────────────
SELECT 'Contraintes ajoutées' AS check, conname, conrelid::regclass AS table_name
  FROM pg_constraint
  WHERE conname IN (
    'donations_paypal_order_unique',
    'user_purchases_paypal_order_unique',
    'donations_amount_sane',
    'user_purchases_amount_sane',
    'chat_messages_len',
    'photo_comments_len',
    'donations_message_len',
    'donations_display_name_len',
    'profiles_display_name_len'
  )
  ORDER BY conname;

SELECT 'Triggers rate-limit' AS check, tgname, tgrelid::regclass AS table_name
  FROM pg_trigger
  WHERE tgname IN ('chat_rate_limit_trigger', 'photo_comment_rate_limit_trigger');

-- Fin V20
