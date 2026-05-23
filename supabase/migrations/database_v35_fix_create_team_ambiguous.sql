-- ============================================
-- V35 — Fix bug "column reference invite_code is ambiguous"
-- ============================================
-- Bug : create_team() utilise RETURNS TABLE (id uuid, invite_code text).
-- Dans PL/pgSQL, les colonnes du RETURNS TABLE sont visibles comme des
-- variables homonymes — du coup `WHERE invite_code = X` est ambigu :
-- Postgres ne sait pas si on parle de la colonne `teams.invite_code` ou
-- de la variable de retour `invite_code`. La fonction lève l'exception
-- au premier appel.
--
-- Fix : qualifier la colonne avec `teams.invite_code`.
-- Cette migration ré-installe create_team avec la version corrigée.
-- ============================================

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

  -- 1 team max par user (si V34 appliquée ; sinon ce check est redondant
  -- avec la contrainte UNIQUE de V34 mais ne fait pas de mal)
  IF EXISTS (SELECT 1 FROM public.team_members WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Tu fais déjà partie d''une team. Quitte-la d''abord.';
  END IF;

  -- Boucle de génération du code unique.
  -- ⚠️ Qualifier teams.invite_code pour éviter l'ambiguïté avec la
  -- variable de retour homonyme.
  LOOP
    new_code := upper(substring(md5(random()::text || clock_timestamp()::text), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.teams t WHERE t.invite_code = new_code);
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

-- Fin V35
