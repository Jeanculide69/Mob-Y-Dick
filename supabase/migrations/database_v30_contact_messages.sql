-- ============================================
-- V30 — Table contact_messages (formulaire de contact public)
-- ============================================
-- Ajout d'un canal de support : depuis le footer du site, n'importe quel
-- visiteur peut envoyer un message avec une catégorie. L'admin les consulte
-- via un nouveau panneau dédié.
--
-- Catégories métier :
--   - bug         : problème technique sur le site
--   - achat       : question relative à un achat / livraison
--   - rgpd        : exercice des droits RGPD (accès, rectif, suppression)
--   - reclamation : réclamation formelle, médiation
--   - autre       : tout le reste
--
-- Statut interne :
--   - nouveau     : message non encore traité (défaut à l'insert)
--   - lu          : message lu par un admin mais sans réponse encore
--   - resolu      : traité et clôturé
--
-- Idempotent.
-- ============================================


-- ─────────────────────────────────────────
-- 1. Table contact_messages
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contact_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  category text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'nouveau',
  handled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  handled_at timestamp with time zone,
  admin_notes text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index pour le tri admin (plus récents en haut)
CREATE INDEX IF NOT EXISTS contact_messages_created_at_idx
  ON public.contact_messages (created_at DESC);

-- Index partiel pour la query "messages non traités" (charge admin)
CREATE INDEX IF NOT EXISTS contact_messages_status_idx
  ON public.contact_messages (status) WHERE status != 'resolu';


-- ─────────────────────────────────────────
-- 2. CHECK constraints
-- ─────────────────────────────────────────
ALTER TABLE public.contact_messages
  DROP CONSTRAINT IF EXISTS contact_messages_category_chk;
ALTER TABLE public.contact_messages
  ADD CONSTRAINT contact_messages_category_chk
    CHECK (category IN ('bug', 'achat', 'rgpd', 'reclamation', 'autre'));

ALTER TABLE public.contact_messages
  DROP CONSTRAINT IF EXISTS contact_messages_status_chk;
ALTER TABLE public.contact_messages
  ADD CONSTRAINT contact_messages_status_chk
    CHECK (status IN ('nouveau', 'lu', 'resolu'));

-- Email : format simple (présence d'un @, longueur RFC 5321)
ALTER TABLE public.contact_messages
  DROP CONSTRAINT IF EXISTS contact_messages_email_format;
ALTER TABLE public.contact_messages
  ADD CONSTRAINT contact_messages_email_format
    CHECK (LENGTH(email) BETWEEN 3 AND 254 AND email LIKE '%@%');

-- Message : non vide, max 2000 chars (généreux pour les réclamations)
ALTER TABLE public.contact_messages
  DROP CONSTRAINT IF EXISTS contact_messages_message_len;
ALTER TABLE public.contact_messages
  ADD CONSTRAINT contact_messages_message_len
    CHECK (LENGTH(message) BETWEEN 5 AND 2000);


-- ─────────────────────────────────────────
-- 3. RLS : INSERT public, SELECT/UPDATE admin
-- ─────────────────────────────────────────
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

-- N'importe qui (anonyme ou connecté) peut envoyer un message
DROP POLICY IF EXISTS "contact_messages_insert_public" ON public.contact_messages;
CREATE POLICY "contact_messages_insert_public" ON public.contact_messages
  FOR INSERT WITH CHECK (true);

-- Seuls les admins peuvent lire (les messages contiennent des emails +
-- éventuellement des données personnelles)
DROP POLICY IF EXISTS "contact_messages_select_admin" ON public.contact_messages;
CREATE POLICY "contact_messages_select_admin" ON public.contact_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Seuls les admins peuvent updater le statut et les notes internes
DROP POLICY IF EXISTS "contact_messages_update_admin" ON public.contact_messages;
CREATE POLICY "contact_messages_update_admin" ON public.contact_messages
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Seuls les admins peuvent supprimer (RGPD : droit à l'effacement)
DROP POLICY IF EXISTS "contact_messages_delete_admin" ON public.contact_messages;
CREATE POLICY "contact_messages_delete_admin" ON public.contact_messages
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );


-- ─────────────────────────────────────────
-- 4. Vérifications
-- ─────────────────────────────────────────
SELECT 'Table contact_messages' AS check, column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'contact_messages'
  ORDER BY ordinal_position;

SELECT 'Policies contact_messages' AS check, policyname, cmd
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'contact_messages'
  ORDER BY policyname;

-- Fin V30
