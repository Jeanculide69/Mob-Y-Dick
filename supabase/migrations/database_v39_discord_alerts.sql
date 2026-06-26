-- ============================================
-- V39 — Alertes Discord (notifications activité du site)
-- ============================================
-- Envoie une alerte Discord (via l'edge function `discord-alert`) à chaque
-- événement notable, directement depuis Postgres avec pg_net (asynchrone,
-- fire-and-forget — n'ajoute aucune latence et NE BLOQUE JAMAIS l'écriture).
--
-- Événements couverts par cette migration :
--   - profiles    INSERT  → 🆕 nouvel utilisateur (email + Google OAuth inclus)
--   - profiles    UPDATE  → ✏️ demande de pseudo (display_name_status='pending')
--   - orders      INSERT  → 🛒 nouvelle commande boutique
--   - user_purchases INSERT → 💎 nouvel achat (emote / sponsoring)
--   - contact_messages INSERT → 📩 nouveau message de contact
--   - teams       INSERT  → 🏍️ nouvelle équipe
--
--   (Les « connexions échouées à répétition » ne sont PAS un événement DB :
--    elles sont signalées côté navigateur, cf. src/utils/discordAlert.js.)
--
-- ─── PRÉ-REQUIS DE DÉPLOIEMENT (à faire UNE FOIS) ───
--   1. Déployer l'edge function :
--        supabase functions deploy discord-alert --no-verify-jwt
--   2. Définir les secrets de la function (le webhook reste côté serveur) :
--        supabase secrets set DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/XXX/YYY"
--        supabase secrets set ALERT_SHARED_SECRET="<UN_SECRET_ALEATOIRE>"
--   3. Stocker le MÊME secret dans Vault (lu par le trigger ci-dessous) :
--        select vault.create_secret('<UN_SECRET_ALEATOIRE>', 'discord_alert_secret');
--      (Si le secret existe déjà : select vault.update_secret(
--         (select id from vault.secrets where name='discord_alert_secret'),
--         '<UN_SECRET_ALEATOIRE>'); )
--
-- Idempotent. Sûr à rejouer.
-- ============================================

-- ─────────────────────────────────────────
-- 0. Extension pg_net (HTTP asynchrone depuis Postgres)
-- ─────────────────────────────────────────
create extension if not exists pg_net;

-- ─────────────────────────────────────────
-- 1. Fonction trigger générique
--    SECURITY DEFINER : tourne en tant que owner (postgres) pour pouvoir lire
--    le secret dans Vault, quel que soit le rôle qui déclenche l'écriture
--    (anon, authenticated, service_role).
--    search_path = '' : tout est qualifié par son schéma (bonne pratique sécu).
--    Exception-safe : une panne d'alerte ne doit JAMAIS faire échouer l'insert.
-- ─────────────────────────────────────────
create or replace function public.notify_discord_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret  text;
  v_url     text := 'https://jmklarbngqkwakogmsec.supabase.co/functions/v1/discord-alert';
  v_payload jsonb;
begin
  begin
    -- Secret partagé (doit matcher ALERT_SHARED_SECRET de l'edge function)
    select decrypted_secret into v_secret
      from vault.decrypted_secrets
      where name = 'discord_alert_secret'
      limit 1;

    v_payload := jsonb_build_object(
      'type',       tg_op,
      'table',      tg_table_name,
      'record',     to_jsonb(new),
      'old_record', case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end
    );

    perform net.http_post(
      url     := v_url,
      body    := v_payload,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'x-alert-secret', coalesce(v_secret, '')
      ),
      timeout_milliseconds := 5000
    );
  exception when others then
    -- On avale toute erreur : l'inscription / commande / message doit aboutir
    -- même si Discord, pg_net ou Vault est indisponible.
    raise warning '[notify_discord_event] alerte non envoyée (% %): %',
      tg_table_name, tg_op, sqlerrm;
  end;

  return coalesce(new, old);
end;
$$;

comment on function public.notify_discord_event() is
  'Trigger générique : POST l''événement vers l''edge function discord-alert (pg_net, async, fail-safe). V39.';

-- ─────────────────────────────────────────
-- 2. Triggers (créés via DO blocks : on ne pose le trigger que si la table
--    /colonne existe, pour que la migration reste rejouable et ne casse pas
--    si un module n'est pas présent).
-- ─────────────────────────────────────────

-- 2a. profiles INSERT → nouvel utilisateur
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'profiles') then
    drop trigger if exists trg_discord_profile_insert on public.profiles;
    create trigger trg_discord_profile_insert
      after insert on public.profiles
      for each row execute function public.notify_discord_event();
  end if;
end $$;

-- 2b. profiles UPDATE → demande de pseudo (transition vers 'pending')
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles'
               and column_name = 'display_name_status') then
    drop trigger if exists trg_discord_profile_pseudo on public.profiles;
    create trigger trg_discord_profile_pseudo
      after update on public.profiles
      for each row
      when (new.display_name_status = 'pending'
            and new.display_name_status is distinct from old.display_name_status)
      execute function public.notify_discord_event();
  end if;
end $$;

-- 2c. orders INSERT → nouvelle commande
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'orders') then
    drop trigger if exists trg_discord_order_insert on public.orders;
    create trigger trg_discord_order_insert
      after insert on public.orders
      for each row execute function public.notify_discord_event();
  end if;
end $$;

-- 2d. user_purchases INSERT → nouvel achat
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'user_purchases') then
    drop trigger if exists trg_discord_purchase_insert on public.user_purchases;
    create trigger trg_discord_purchase_insert
      after insert on public.user_purchases
      for each row execute function public.notify_discord_event();
  end if;
end $$;

-- 2e. contact_messages INSERT → nouveau message de contact
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'contact_messages') then
    drop trigger if exists trg_discord_contact_insert on public.contact_messages;
    create trigger trg_discord_contact_insert
      after insert on public.contact_messages
      for each row execute function public.notify_discord_event();
  end if;
end $$;

-- 2f. teams INSERT → nouvelle équipe
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'teams') then
    drop trigger if exists trg_discord_team_insert on public.teams;
    create trigger trg_discord_team_insert
      after insert on public.teams
      for each row execute function public.notify_discord_event();
  end if;
end $$;

-- ─────────────────────────────────────────
-- 3. Vérifications
-- ─────────────────────────────────────────
select 'Triggers Discord installés' as check, event_object_table, trigger_name, action_timing, event_manipulation
  from information_schema.triggers
  where trigger_name like 'trg_discord_%'
  order by event_object_table, trigger_name;

select 'Secret Vault présent ?' as check,
       exists(select 1 from vault.decrypted_secrets where name = 'discord_alert_secret') as discord_alert_secret_set;

-- Fin V39
