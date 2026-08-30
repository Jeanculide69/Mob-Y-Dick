-- Classement agrégé côté base.
--
-- Avant, la page Championnat téléchargeait les 5 225 lignes de race_laps
-- (877 Ko par visite) pour les additionner dans le navigateur. Cette fonction
-- renvoie directement, par session et par équipe : le nombre de passages, le
-- dernier passage (départage les ex aequo) et le meilleur tour — soit ~130
-- lignes, ~10 Ko. Le calcul est identique à celui qui était fait côté client :
-- le premier tour vaut son temps absolu, les suivants la différence avec le
-- précédent, et le meilleur tour est le minimum de ces intervalles.
--
-- security invoker : les RLS de race_laps s'appliquent comme avant, la
-- fonction ne donne accès à rien de plus que le select qu'elle remplace.

create or replace function public.race_standings(p_sessions uuid[])
returns table (
  session_id      uuid,
  team_id         uuid,
  laps            int,
  last_passage_ms int,
  best_lap_ms     int
)
language sql
stable
security invoker
set search_path = public
as $$
  with splits as (
    select
      l.session_id,
      l.team_id,
      l.lap_time_ms,
      l.lap_time_ms - lag(l.lap_time_ms) over (
        partition by l.session_id, l.team_id order by l.lap_time_ms, l.id
      ) as split
    from public.race_laps l
    where l.session_id = any(p_sessions)
  )
  select
    s.session_id,
    s.team_id,
    count(*)::int,
    max(s.lap_time_ms)::int,
    min(coalesce(s.split, s.lap_time_ms))::int
  from splits s
  group by s.session_id, s.team_id;
$$;

grant execute on function public.race_standings(uuid[]) to anon, authenticated;
