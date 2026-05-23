-- ============================================
-- V34 — Limite 1 team max par utilisateur
-- ============================================
-- V33 autorisait un user à être dans plusieurs teams (PK composite
-- team_id + user_id). Décision produit : un user = une team (UI au
-- singulier "Ma Team", évite la complexité multi-onglets dans le live).
--
-- Cette migration :
--   1. Ajoute UNIQUE(user_id) sur team_members (filet de sécurité BDD)
--   2. Met à jour create_team et join_team pour rejeter proprement avec
--      un message explicite (avant que la contrainte UNIQUE ne lève une
--      erreur peu lisible côté client)
--
-- ⚠️  Pré-condition : si des users sont déjà dans plusieurs teams au
-- moment d'appliquer cette migration, l'ALTER TABLE ADD CONSTRAINT
-- échouera. La requête de diag en début de fichier le détecte.
-- ============================================

-- ─── 0. Diagnostic préalable ──────────────────
-- Liste les users actuellement dans 2+ teams. Si non vide, il faut nettoyer
-- AVANT d'appliquer le UNIQUE (DELETE manuel des doublons).
SELECT 'users in multiple teams (must be empty)' AS check,
       user_id,
       count(*) AS team_count
  FROM public.team_members
  GROUP BY user_id
  HAVING count(*) > 1;

-- ─── 1. Contrainte UNIQUE(user_id) ───────────
-- Le DROP IF EXISTS rend la migration rejouable.
ALTER TABLE public.team_members
  DROP CONSTRAINT IF EXISTS team_members_user_id_unique;
ALTER TABLE public.team_members
  ADD CONSTRAINT team_members_user_id_unique UNIQUE (user_id);

-- ─── 2. create_team : check pré-emptif ────────
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

  -- 1 team max par user
  IF EXISTS (SELECT 1 FROM public.team_members WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Tu fais déjà partie d''une team. Quitte-la d''abord pour en créer une nouvelle.';
  END IF;

  -- Génère un code unique (boucle bornée)
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

-- ─── 3. join_team : check pré-emptif ──────────
CREATE OR REPLACE FUNCTION public.join_team(code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_team_id uuid;
  cleaned_code text;
  my_existing_team uuid;
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

  -- Si déjà dans une team : idempotent si c'est la même, sinon rejet
  SELECT team_id INTO my_existing_team
  FROM public.team_members
  WHERE user_id = auth.uid();

  IF my_existing_team IS NOT NULL THEN
    IF my_existing_team = target_team_id THEN
      RETURN target_team_id; -- déjà membre de cette team, idempotent
    ELSE
      RAISE EXCEPTION 'Tu fais déjà partie d''une autre team. Quitte-la d''abord.';
    END IF;
  END IF;

  INSERT INTO public.team_members (team_id, user_id, role)
  VALUES (target_team_id, auth.uid(), 'member');

  RETURN target_team_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_team(text) TO authenticated;

-- ─── 4. Vérification ─────────────────────────
SELECT 'team_members constraints' AS check, conname, contype
  FROM pg_constraint
  WHERE conrelid = 'public.team_members'::regclass
  ORDER BY conname;

-- Fin V34
