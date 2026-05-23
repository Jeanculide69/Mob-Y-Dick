-- ============================================
-- V36 — RPCs admin pour gérer toutes les teams
-- ============================================
-- Le RLS de V33 bloque l'admin du voir les teams dont il n'est pas membre.
-- Plutôt qu'ouvrir le RLS aux admins (ce qui exposerait aussi insert/update
-- avec tous les risques associés), on expose des RPCs SECURITY DEFINER
-- qui vérifient is_user_admin() au début et accèdent aux tables en passant
-- outre le RLS.
--
-- 5 RPCs admin :
--   * admin_list_teams() : toutes les teams + nb_members
--   * admin_list_team_members(team_id) : membres d'une team
--   * admin_delete_team(team_id) : supprime une team (CASCADE retire tout)
--   * admin_remove_member(team_id, user_id) : retire un membre (pas l'owner)
--   * admin_add_member(team_id, user_id) : ajoute un user à une team
-- ============================================

-- ─── admin_list_teams ─────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_teams()
RETURNS TABLE (
  id uuid,
  name text,
  owner_id uuid,
  owner_name text,
  invite_code text,
  created_at timestamptz,
  member_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_user_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;

  RETURN QUERY
    SELECT
      t.id,
      t.name,
      t.owner_id,
      p.display_name AS owner_name,
      t.invite_code,
      t.created_at,
      (SELECT count(*) FROM public.team_members tm WHERE tm.team_id = t.id) AS member_count
    FROM public.teams t
    LEFT JOIN public.profiles p ON p.id = t.owner_id
    ORDER BY t.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_teams() TO authenticated;

-- ─── admin_list_team_members ──────────────────
CREATE OR REPLACE FUNCTION public.admin_list_team_members(target_team uuid)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  avatar_url text,
  role text,
  joined_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_user_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;

  RETURN QUERY
    SELECT
      tm.user_id,
      p.display_name,
      p.avatar_url,
      tm.role,
      tm.joined_at
    FROM public.team_members tm
    LEFT JOIN public.profiles p ON p.id = tm.user_id
    WHERE tm.team_id = target_team
    ORDER BY (tm.role = 'owner') DESC, tm.joined_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_team_members(uuid) TO authenticated;

-- ─── admin_delete_team ────────────────────────
CREATE OR REPLACE FUNCTION public.admin_delete_team(target_team uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_user_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.teams WHERE id = target_team) THEN
    RAISE EXCEPTION 'Team introuvable';
  END IF;

  -- ON DELETE CASCADE sur team_members, team_chat_messages, team_announcements
  -- retire tout en chaîne.
  DELETE FROM public.teams WHERE id = target_team;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_team(uuid) TO authenticated;

-- ─── admin_remove_member ──────────────────────
-- Retire un membre (mais pas l'owner — il faut admin_delete_team pour ça).
CREATE OR REPLACE FUNCTION public.admin_remove_member(target_team uuid, target_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  member_role text;
BEGIN
  IF NOT public.is_user_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;

  SELECT role INTO member_role
    FROM public.team_members
    WHERE team_id = target_team AND user_id = target_user;

  IF member_role IS NULL THEN
    RAISE EXCEPTION 'Cet utilisateur n''est pas membre de cette team';
  END IF;
  IF member_role = 'owner' THEN
    RAISE EXCEPTION 'Impossible de retirer le créateur. Supprime la team pour la dissoudre.';
  END IF;

  DELETE FROM public.team_members
    WHERE team_id = target_team AND user_id = target_user;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_remove_member(uuid, uuid) TO authenticated;

-- ─── admin_add_member ─────────────────────────
-- Ajoute un user à une team. Respecte la contrainte "1 team max par user"
-- de V34 : si le user est déjà dans une team, on rejette proprement.
CREATE OR REPLACE FUNCTION public.admin_add_member(target_team uuid, target_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_user_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.teams WHERE id = target_team) THEN
    RAISE EXCEPTION 'Team introuvable';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = target_user) THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;

  -- Check "1 team max par user"
  IF EXISTS (SELECT 1 FROM public.team_members WHERE user_id = target_user) THEN
    RAISE EXCEPTION 'Cet utilisateur fait déjà partie d''une autre team';
  END IF;

  INSERT INTO public.team_members (team_id, user_id, role)
  VALUES (target_team, target_user, 'member');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_add_member(uuid, uuid) TO authenticated;

-- ─── admin_list_addable_users ─────────────────
-- Helper : liste les profiles qui ne sont actuellement dans AUCUNE team
-- (donc ajoutables). Utilisé par l'UI admin pour le dropdown "ajouter
-- membre".
CREATE OR REPLACE FUNCTION public.admin_list_addable_users()
RETURNS TABLE (
  id uuid,
  display_name text,
  avatar_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_user_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;

  RETURN QUERY
    SELECT p.id, p.display_name, p.avatar_url
    FROM public.profiles p
    WHERE NOT EXISTS (
      SELECT 1 FROM public.team_members tm WHERE tm.user_id = p.id
    )
    ORDER BY p.display_name NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_addable_users() TO authenticated;

-- ─── Vérification ─────────────────────────────
SELECT 'admin RPCs' AS check, proname
  FROM pg_proc
  WHERE proname LIKE 'admin_%team%' OR proname = 'admin_list_addable_users'
  ORDER BY proname;

-- Fin V36
