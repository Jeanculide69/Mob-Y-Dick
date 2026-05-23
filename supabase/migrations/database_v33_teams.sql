-- ============================================
-- V33 — Système de Teams (groupes privés)
-- ============================================
-- Feature :
--   * N'importe quel user authentifié crée une team (nom libre, 2-40 chars)
--   * Reçoit un invite_code 6 caractères à partager
--   * Les invités rejoignent via ce code
--   * Chat dédié par team (séparé du chat global existant)
--   * Annonces team : un membre poste, lue uniquement par les membres de SA team
--
-- Modèle de sécurité :
--   * RLS strict sur les 4 tables (teams, team_members, team_chat_messages,
--     team_announcements). Pas de lecture cross-team possible.
--   * Toutes les insertions dans team_members passent par RPC (create_team,
--     join_team) — pas de policy INSERT directe → impossible de s'ajouter
--     soi-même dans une team sans connaître l'invite_code.
--   * Helper is_team_member() en SECURITY DEFINER pour éviter la récursion
--     RLS quand on évalue les policies sur team_members.
--
-- Test d'isolation à faire après migration (cf docstring en bas du fichier).
-- ============================================

-- ─── 1. Tables ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 40),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_members (
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.team_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL CHECK (length(message) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL CHECK (length(message) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 2. Index ──────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON public.team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_chat_team_created ON public.team_chat_messages(team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_announcements_team_created ON public.team_announcements(team_id, created_at DESC);

-- ─── 3. Helper is_team_member (SECURITY DEFINER) ────
-- Outrepasse RLS pour éviter la récursion quand une policy sur team_members
-- évalue is_team_member() qui ferait SELECT sur team_members.

CREATE OR REPLACE FUNCTION public.is_team_member(team uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = team AND user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_team_member(uuid) TO authenticated;

-- ─── 4. RPC create_team ────────────────────────
-- Crée la team + ajoute le créateur comme owner atomiquement.
-- Génère un invite_code unique (6 chars hex majuscules).

CREATE OR REPLACE FUNCTION public.create_team(team_name text)
RETURNS TABLE (id uuid, invite_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_team_id uuid;
  new_code text;
  attempts int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF length(trim(coalesce(team_name, ''))) < 2 THEN
    RAISE EXCEPTION 'Nom de team trop court (min 2 caractères)';
  END IF;
  IF length(trim(team_name)) > 40 THEN
    RAISE EXCEPTION 'Nom de team trop long (max 40 caractères)';
  END IF;

  -- Génère un code unique (boucle bornée pour ne pas planter en cas de bug)
  LOOP
    new_code := upper(substring(md5(random()::text || clock_timestamp()::text), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.teams WHERE invite_code = new_code);
    attempts := attempts + 1;
    IF attempts > 20 THEN
      RAISE EXCEPTION 'Impossible de générer un code unique, réessayer';
    END IF;
  END LOOP;

  INSERT INTO public.teams (name, owner_id, invite_code)
  VALUES (trim(team_name), auth.uid(), new_code)
  RETURNING teams.id INTO new_team_id;

  INSERT INTO public.team_members (team_id, user_id, role)
  VALUES (new_team_id, auth.uid(), 'owner');

  RETURN QUERY SELECT new_team_id, new_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_team(text) TO authenticated;

-- ─── 5. RPC join_team ──────────────────────────
-- Rejoint une team via son invite_code. Idempotent : si déjà membre, retourne
-- juste l'id sans erreur.

CREATE OR REPLACE FUNCTION public.join_team(code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_team_id uuid;
  cleaned_code text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  cleaned_code := upper(trim(coalesce(code, '')));
  IF length(cleaned_code) <> 6 THEN
    RAISE EXCEPTION 'Code d''invitation invalide';
  END IF;

  SELECT teams.id INTO target_team_id
  FROM public.teams
  WHERE invite_code = cleaned_code;

  IF target_team_id IS NULL THEN
    RAISE EXCEPTION 'Code d''invitation introuvable';
  END IF;

  -- Idempotent : si déjà membre, on retourne juste l'id
  IF EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = target_team_id AND user_id = auth.uid()
  ) THEN
    RETURN target_team_id;
  END IF;

  INSERT INTO public.team_members (team_id, user_id, role)
  VALUES (target_team_id, auth.uid(), 'member');

  RETURN target_team_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_team(text) TO authenticated;

-- ─── 6. RPC leave_team ─────────────────────────
-- Permet à un membre de quitter. L'owner ne peut PAS quitter sa propre team
-- (il faudrait transférer ou supprimer — pour plus tard).

CREATE OR REPLACE FUNCTION public.leave_team(team uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  my_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO my_role
  FROM public.team_members
  WHERE team_id = team AND user_id = auth.uid();

  IF my_role IS NULL THEN
    RAISE EXCEPTION 'Tu n''es pas membre de cette team';
  END IF;
  IF my_role = 'owner' THEN
    RAISE EXCEPTION 'Le créateur ne peut pas quitter sa team. Supprime-la ou transfère la propriété.';
  END IF;

  DELETE FROM public.team_members
  WHERE team_id = team AND user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.leave_team(uuid) TO authenticated;

-- ─── 7. RLS : activation ──────────────────────

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_announcements ENABLE ROW LEVEL SECURITY;

-- Cleanup au cas où on rejouerait la migration
DROP POLICY IF EXISTS "teams_select_member"   ON public.teams;
DROP POLICY IF EXISTS "teams_update_owner"    ON public.teams;
DROP POLICY IF EXISTS "teams_delete_owner"    ON public.teams;
DROP POLICY IF EXISTS "team_members_select"   ON public.team_members;
DROP POLICY IF EXISTS "team_members_delete"   ON public.team_members;
DROP POLICY IF EXISTS "team_chat_select"      ON public.team_chat_messages;
DROP POLICY IF EXISTS "team_chat_insert"      ON public.team_chat_messages;
DROP POLICY IF EXISTS "team_chat_delete_own"  ON public.team_chat_messages;
DROP POLICY IF EXISTS "team_ann_select"       ON public.team_announcements;
DROP POLICY IF EXISTS "team_ann_insert"       ON public.team_announcements;

-- ─── 8. RLS teams ─────────────────────────────
-- SELECT : uniquement si on est membre. Note : pour le flow "join via code",
-- on NE passe PAS par SELECT (qui révèlerait l'id avant d'avoir rejoint),
-- on passe par la RPC join_team() qui vérifie le code en SECURITY DEFINER.
-- Pas de policy INSERT : seule la RPC create_team() peut créer.

CREATE POLICY "teams_select_member" ON public.teams
  FOR SELECT TO authenticated
  USING (public.is_team_member(id));

CREATE POLICY "teams_update_owner" ON public.teams
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "teams_delete_owner" ON public.teams
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- ─── 9. RLS team_members ──────────────────────
-- SELECT : seulement les membres de la même team peuvent se voir entre eux.
-- DELETE : un user peut se retirer lui-même (via RPC leave_team de préférence,
-- mais on autorise aussi le delete direct sur sa propre ligne).
-- Pas de policy INSERT : seules les RPCs create_team / join_team peuvent
-- insérer (en SECURITY DEFINER, donc outrepassent RLS).

CREATE POLICY "team_members_select" ON public.team_members
  FOR SELECT TO authenticated
  USING (public.is_team_member(team_id));

CREATE POLICY "team_members_delete" ON public.team_members
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ─── 10. RLS team_chat_messages ───────────────

CREATE POLICY "team_chat_select" ON public.team_chat_messages
  FOR SELECT TO authenticated
  USING (public.is_team_member(team_id));

CREATE POLICY "team_chat_insert" ON public.team_chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_team_member(team_id)
    AND user_id = auth.uid()
  );

CREATE POLICY "team_chat_delete_own" ON public.team_chat_messages
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ─── 11. RLS team_announcements ───────────────

CREATE POLICY "team_ann_select" ON public.team_announcements
  FOR SELECT TO authenticated
  USING (public.is_team_member(team_id));

CREATE POLICY "team_ann_insert" ON public.team_announcements
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_team_member(team_id)
    AND created_by = auth.uid()
  );

-- ─── 12. Realtime publication ─────────────────
-- On expose chat + annonces au realtime pour push instantané.
-- IMPORTANT : Realtime respecte les RLS sur les SELECT, donc les events
-- INSERT ne sont diffusés qu'aux clients qui passeraient la policy SELECT.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'team_chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_chat_messages;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'team_announcements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_announcements;
  END IF;
END $$;

-- ─── 13. Vérification ─────────────────────────

SELECT 'teams tables' AS check, tablename
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN ('teams', 'team_members', 'team_chat_messages', 'team_announcements')
  ORDER BY tablename;

SELECT 'teams policies' AS check, tablename, policyname, cmd
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('teams', 'team_members', 'team_chat_messages', 'team_announcements')
  ORDER BY tablename, policyname;

-- ─── Test d'isolation manuel (à faire après migration) ───
-- 1. Avec User A (connecté) :
--      SELECT create_team('Team A');     -- récupère id_A + code_A
--      INSERT chat → 'Coucou A'           via supabase.from('team_chat_messages')
-- 2. Avec User B (autre navigateur) :
--      SELECT create_team('Team B');     -- récupère id_B
--      SELECT * FROM team_chat_messages; -- doit retourner 0 lignes
--      SELECT * FROM teams;               -- ne doit voir QUE Team B
--      INSERT chat avec team_id = id_A → doit échouer (RLS violation)
-- 3. User B fait join_team(code_A) :
--      SELECT * FROM team_chat_messages; -- doit maintenant voir 'Coucou A'
--
-- Fin V33
