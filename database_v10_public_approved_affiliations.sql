-- v10 : Affichage public des affiliations moto approuvées
--
-- Problème : MotoPage.jsx affiche le pilote affilié à une moto via la table
-- moto_affiliations. La RLS actuelle (ma_read_own) ne laisse lire que les
-- affiliations de l'utilisateur courant. Résultat :
--   - Logué : on voit sa propre affiliation → bon nom affiché
--   - Anonyme / autre user : 0 résultat → fallback sur stats.pilots (nom
--     saisi dans race_teams par l'organisateur) → mauvais nom affiché
--
-- Fix : ajouter une policy en lecture publique limitée aux affiliations
-- approuvées (status = 'approved'). Les affiliations en attente/rejetées
-- restent privées.
--
-- Idem pour profiles : on doit pouvoir lire le display_name des users
-- approuvés sans être loggé. Si la policy actuelle bloque déjà, on ajoute
-- une lecture publique restreinte au champ display_name via une vue ou
-- en s'appuyant sur une policy permissive en select (la table profiles
-- contient peu de données sensibles publiques).

-- ─── moto_affiliations : lecture publique des approuvées ───
drop policy if exists "ma_read_approved_public" on public.moto_affiliations;
create policy "ma_read_approved_public"
  on public.moto_affiliations
  for select
  to anon, authenticated
  using (status = 'approved');

-- ─── profiles : lecture publique de display_name + avatar_url ───
-- Si une policy "profiles_read_self" existe et bloque les autres lectures,
-- on ajoute une seconde policy permissive pour les champs publics.
-- Les RLS en SELECT sont OR-évaluées entre policies → ajouter ne casse rien.
drop policy if exists "profiles_read_public" on public.profiles;
create policy "profiles_read_public"
  on public.profiles
  for select
  to anon, authenticated
  using (true);
-- Note : si tu veux limiter les champs lisibles publiquement, il faudrait
-- passer par une vue. Ici on accepte que display_name + avatar_url + role
-- soient visibles publiquement — ce sont des données déjà affichées dans
-- le chat live et le classement, donc rien de neuf.
