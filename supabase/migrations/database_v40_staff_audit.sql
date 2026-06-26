-- ============================================
-- V40 — Journal d'audit Discord des actions STAFF
-- ============================================
-- « Qui fait quoi, quand » : à chaque création / modification / suppression
-- par un membre du staff (organisateur, admin, modérateur), envoie une alerte
-- Discord avec le PSEUDO de l'acteur, son rôle, l'action, la table, l'élément
-- visé, le détail des champs modifiés et l'horodatage.
--
-- Réutilise l'edge function `discord-alert` et le secret Vault
-- `discord_alert_secret` posés en V39 — RIEN de plus à configurer.
--
-- ─── Principe ───
--   Le trigger résout l'acteur via auth.uid() → public.profiles (pseudo+rôle).
--   • Action faite par le système (service_role, ex. webhook Stripe) → auth.uid()
--     est NULL → AUCUNE alerte (ce n'est pas une action humaine).
--   • Action faite par un simple visiteur (role 'user') → AUCUNE alerte
--     (sinon ce serait chaque achat / inscription / commentaire).
--   • Action faite par organisateur / admin / modérateur → ALERTE d'audit.
--
-- ─── Tables suivies ───
--   Contenu / config (INSERT + UPDATE + DELETE) :
--     events, products, shop_items, emote_triggers, sponsors, bikes, blog,
--     settings, moto_affiliations, race_announcements
--   Structure course / équipe (INSERT + DELETE seulement, pour éviter le bruit
--   des mises à jour pendant un live) :
--     race_sessions, race_teams, team_members, team_announcements
--   Sécurité :
--     profiles → uniquement les CHANGEMENTS DE RÔLE (🛡️)
--
--   VOLONTAIREMENT EXCLUES (trop de volume / non pertinent pour l'audit) :
--     race_laps (chronos live), chat_messages, team_chat_messages,
--     live_messages, photo_comments, gallery, moto_profiles.
--   (La création de compte / pseudo / commande / achat / message de contact
--    est déjà couverte par V39.)
--
-- Idempotent. Fail-safe : une panne d'alerte ne bloque jamais l'écriture.
-- ============================================

create extension if not exists pg_net;

-- ─────────────────────────────────────────
-- 1. Fonction trigger d'audit
-- ─────────────────────────────────────────
create or replace function public.notify_discord_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid;
  v_name    text;
  v_email   text;
  v_role    text;
  v_secret  text;
  v_url     text := 'https://jmklarbngqkwakogmsec.supabase.co/functions/v1/discord-alert';
  v_payload jsonb;
begin
  begin
    v_uid := auth.uid();
    -- Pas de JWT utilisateur (action système / service_role) → on n'audite pas
    if v_uid is null then
      return coalesce(new, old);
    end if;

    select display_name, email, role
      into v_name, v_email, v_role
      from public.profiles
      where id = v_uid;

    -- On n'alerte QUE pour le staff
    if v_role is null or v_role not in ('organisateur', 'admin', 'moderator') then
      return coalesce(new, old);
    end if;

    select decrypted_secret into v_secret
      from vault.decrypted_secrets
      where name = 'discord_alert_secret'
      limit 1;

    v_payload := jsonb_build_object(
      'type',       tg_op,
      'table',      tg_table_name,
      'record',     case when tg_op <> 'DELETE' then to_jsonb(new) else null end,
      'old_record', case when tg_op <> 'INSERT' then to_jsonb(old) else null end,
      'audit', jsonb_build_object(
        'actor_id',   v_uid,
        'actor_name', coalesce(nullif(btrim(v_name), ''), v_email, '(inconnu)'),
        'actor_role', v_role,
        'at',         now()
      )
    );

    perform net.http_post(
      url     := v_url,
      body    := v_payload,
      headers := jsonb_build_object(
        'Content-Type',   'application/json',
        'x-alert-secret', coalesce(v_secret, '')
      ),
      timeout_milliseconds := 5000
    );
  exception when others then
    raise warning '[notify_discord_audit] audit non envoyé (% %): %',
      tg_table_name, tg_op, sqlerrm;
  end;

  return coalesce(new, old);
end;
$$;

comment on function public.notify_discord_audit() is
  'Audit Discord des actions staff (organisateur/admin/modérateur) via discord-alert. V40.';

-- ─────────────────────────────────────────
-- 2. Pose des triggers (guards d'existence pour rester rejouable)
-- ─────────────────────────────────────────

-- 2a. Contenu / config : INSERT + UPDATE + DELETE
do $$
declare t text;
begin
  foreach t in array array[
    'events', 'products', 'shop_items', 'emote_triggers', 'sponsors',
    'bikes', 'blog', 'settings', 'moto_affiliations', 'race_announcements'
  ]
  loop
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = t) then
      execute format('drop trigger if exists trg_discord_audit on public.%I', t);
      execute format(
        'create trigger trg_discord_audit after insert or update or delete on public.%I '
        || 'for each row execute function public.notify_discord_audit()', t);
    end if;
  end loop;
end $$;

-- 2b. Structure course / équipe : INSERT + DELETE seulement
do $$
declare t text;
begin
  foreach t in array array[
    'race_sessions', 'race_teams', 'team_members', 'team_announcements'
  ]
  loop
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = t) then
      execute format('drop trigger if exists trg_discord_audit on public.%I', t);
      execute format(
        'create trigger trg_discord_audit after insert or delete on public.%I '
        || 'for each row execute function public.notify_discord_audit()', t);
    end if;
  end loop;
end $$;

-- 2c. profiles : uniquement les changements de rôle (sécurité)
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles'
               and column_name = 'role') then
    drop trigger if exists trg_discord_audit_role on public.profiles;
    create trigger trg_discord_audit_role
      after update on public.profiles
      for each row
      when (new.role is distinct from old.role)
      execute function public.notify_discord_audit();
  end if;
end $$;

-- ─────────────────────────────────────────
-- 3. Vérification
-- ─────────────────────────────────────────
select 'Triggers audit installés' as check, event_object_table, trigger_name, event_manipulation
  from information_schema.triggers
  where trigger_name like 'trg_discord_audit%'
  order by event_object_table, event_manipulation;

-- Fin V40
