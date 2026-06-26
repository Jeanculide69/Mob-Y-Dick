/**
 * discord-alert — Supabase Edge Function
 *
 * Reçoit des événements du site et poste une alerte Discord (embed) sur le
 * webhook configuré. C'est LE point central des notifications « activité du
 * site » : nouvelles inscriptions, demandes de pseudo, commandes, achats,
 * messages de contact, connexions échouées à répétition, etc.
 *
 * ─── Deux sources d'appel ───
 *   1. TRIGGERS DB (pg_net)  → payload « Database Webhook » :
 *        { type: 'INSERT'|'UPDATE'|'DELETE', table, record, old_record }
 *      Authentifiés par le header `x-alert-secret` == ALERT_SHARED_SECRET.
 *      Voir migration database_v39_discord_alerts.sql.
 *
 *   2. FRONT (navigateur)    → payload « custom » :
 *        { event: 'auth_failed', ...données }
 *      Pas de secret partagé (impossible côté client) : on exige à la place
 *      l'apikey anon du projet (auto-ajoutée par supabase.functions.invoke)
 *      + une allowlist stricte d'events + un rate-limit best-effort. Le but
 *      n'est pas une sécurité forte mais d'éviter le spam trivial du salon.
 *
 * ─── Secrets requis ───
 *   DISCORD_WEBHOOK_URL  = https://discord.com/api/webhooks/xxx/yyy
 *   ALERT_SHARED_SECRET  = secret partagé avec les triggers DB (Vault)
 *   SUPABASE_ANON_KEY    = injectée automatiquement par Supabase
 *
 * ─── Deploy ───
 *   supabase functions deploy discord-alert --no-verify-jwt
 *   (no-verify-jwt : les appels pg_net depuis Postgres n'ont pas de JWT
 *   Supabase ; la sécurité = secret partagé / apikey vérifiés ici.)
 */
// @ts-nocheck — environnement Deno Edge Function
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const DISCORD_WEBHOOK_URL = Deno.env.get('DISCORD_WEBHOOK_URL') || ''
const ALERT_SHARED_SECRET = Deno.env.get('ALERT_SHARED_SECRET') || ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-alert-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// Couleurs Discord (décimal)
const COLORS = {
  green: 0x57f287,
  gold: 0xf1c40f,
  purple: 0x9b59b6,
  blue: 0x3498db,
  red: 0xed4245,
  blurple: 0x5865f2,
  grey: 0x95a5a6,
}

// ──────────────────────────────────────
// Rate-limit best-effort en mémoire (réinitialisé à chaque cold start).
// Protège le chemin « front » (sans secret) contre le spam trivial.
// Clé = ip+event ; fenêtre glissante simple.
// ──────────────────────────────────────
const RL_WINDOW_MS = 60_000
const RL_MAX = 6
const rlHits = new Map<string, number[]>()

function rateLimited(key: string): boolean {
  const now = Date.now()
  const arr = (rlHits.get(key) || []).filter((t) => now - t < RL_WINDOW_MS)
  arr.push(now)
  rlHits.set(key, arr)
  // Petit garde-fou mémoire
  if (rlHits.size > 5000) rlHits.clear()
  return arr.length > RL_MAX
}

// ──────────────────────────────────────
// Helpers de formatage
// ──────────────────────────────────────
function truncate(v: unknown, max = 1024): string {
  const s = v === null || v === undefined ? '—' : String(v)
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

function field(name: string, value: unknown, inline = true) {
  return { name: truncate(name, 256), value: truncate(value, 1024) || '—', inline }
}

function euros(cents: unknown): string {
  const n = Number(cents)
  if (!Number.isFinite(n)) return '—'
  return (n / 100).toFixed(2) + ' €'
}

// ──────────────────────────────────────
// Construit l'embed selon la table (chemin trigger DB) ou un fallback générique.
// ──────────────────────────────────────
function buildDbEmbed(type: string, table: string, record: any, oldRecord: any) {
  const r = record || {}
  const ts = r.created_at || new Date().toISOString()
  const base = { timestamp: ts, footer: { text: `Mob Y Dick · ${table} · ${type}` } }

  switch (table) {
    case 'profiles': {
      if (type === 'INSERT') {
        return {
          title: '🆕 Nouvel utilisateur',
          color: COLORS.green,
          fields: [
            field('Email', r.email),
            field('Pseudo', r.display_name),
            field('Rôle', r.role),
            field('ID', r.id, false),
          ],
          ...base,
        }
      }
      // UPDATE → seul le trigger « demande de pseudo » nous appelle ici
      return {
        title: '✏️ Demande de pseudo',
        color: COLORS.blurple,
        description: 'Un membre a demandé un changement de pseudo (à valider).',
        fields: [
          field('Pseudo actuel', r.display_name),
          field('Pseudo demandé', r.pending_display_name),
          field('Email', r.email),
          field('ID', r.id, false),
        ],
        ...base,
      }
    }

    case 'orders':
      return {
        title: '🛒 Nouvelle commande',
        color: COLORS.gold,
        fields: [
          field('Produit', r.product_name),
          field('Prix', r.price),
          field('Taille', r.size),
          field('Client', r.customer_name),
          field('Email', r.customer_email),
          field('Livraison', [r.shipping_city, r.shipping_country].filter(Boolean).join(', ')),
          field('Texte perso', r.custom_text, false),
          field('Statut', r.status),
        ],
        ...base,
      }

    case 'user_purchases':
      return {
        title: '💎 Nouvel achat',
        color: COLORS.purple,
        fields: [
          field('Article', r.item_slug),
          field('Montant', euros(r.amount_cents)),
          field('Pseudo', r.display_name),
          field('Message', r.custom_message, false),
        ],
        ...base,
      }

    case 'contact_messages':
      return {
        title: '📩 Nouveau message de contact',
        color: COLORS.blue,
        fields: [
          field('Catégorie', r.category),
          field('Email', r.email),
          field('Message', truncate(r.message, 1024), false),
        ],
        ...base,
      }

    case 'teams':
      return {
        title: '🏍️ Nouvelle équipe',
        color: COLORS.green,
        fields: [
          field('Nom', r.name ?? r.team_name),
          field('Owner', r.owner_id ?? r.user_id ?? r.created_by),
        ],
        ...base,
      }

    default: {
      // Fallback générique : on liste les champs scalaires non nuls (max 12)
      // pour que « tout » nouveau trigger fonctionne sans toucher au code.
      const fields = Object.entries(r)
        .filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object')
        .slice(0, 12)
        .map(([k, v]) => field(k, v))
      return {
        title: `📋 ${table} · ${type}`,
        color: COLORS.grey,
        fields: fields.length ? fields : [field('record', JSON.stringify(r).slice(0, 1000), false)],
        ...base,
      }
    }
  }
}

// ──────────────────────────────────────
// Chemin FRONT : events custom autorisés (allowlist stricte).
// ──────────────────────────────────────
function buildCustomEmbed(body: any) {
  const event = String(body?.event || '')
  switch (event) {
    case 'auth_failed': {
      return {
        title: '🔒 Connexions échouées à répétition',
        color: COLORS.red,
        description: 'Plusieurs tentatives de connexion ont échoué pour ce compte.',
        fields: [
          field('Email visé', truncate(body.email, 254)),
          field('Tentatives', body.attempts),
          field('Raison', truncate(body.reason, 256)),
          field('Navigateur', truncate(body.userAgent, 512), false),
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'Mob Y Dick · auth (signalé par le navigateur)' },
      }
    }
    default:
      return null // event non autorisé
  }
}

// ──────────────────────────────────────
// AUDIT STAFF — qui fait quoi, quand (organisateur / admin / modérateur)
// Le trigger (migration v40) envoie un champ `audit` = { actor_id,
// actor_name, actor_role, at }. On formate un embed « traçabilité ».
// ──────────────────────────────────────
const AUDIT_VERB: Record<string, string> = {
  INSERT: 'a créé',
  UPDATE: 'a modifié',
  DELETE: 'a supprimé',
}
const ROLE_COLOR: Record<string, number> = {
  admin: COLORS.red,
  organisateur: COLORS.gold,
  moderator: COLORS.blue,
}
// Champs ignorés dans les diffs (bruit technique)
const AUDIT_SKIP = new Set(['updated_at', 'created_at'])

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return '∅'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

// Trouve un libellé lisible pour la ligne touchée
function rowLabel(r: any): string {
  if (!r) return '—'
  for (const k of ['name', 'title', 'display_name', 'product_name', 'session_name', 'label', 'slug', 'email']) {
    if (r[k]) return String(r[k])
  }
  return r.id ? `id ${r.id}` : '—'
}

// Liste les champs modifiés (ancien → nouveau) pour un UPDATE
function diffFields(oldR: any, newR: any) {
  const keys = new Set([...Object.keys(oldR || {}), ...Object.keys(newR || {})])
  const out: any[] = []
  for (const k of keys) {
    if (AUDIT_SKIP.has(k)) continue
    const a = oldR ? oldR[k] : undefined
    const b = newR ? newR[k] : undefined
    if (JSON.stringify(a) === JSON.stringify(b)) continue
    out.push(field(k, `${truncate(fmtVal(a), 80)} → ${truncate(fmtVal(b), 80)}`, false))
    if (out.length >= 12) break
  }
  return out
}

function buildAuditEmbed(type: string, table: string, record: any, oldRecord: any, audit: any) {
  const verb = AUDIT_VERB[type] || type
  const a = audit || {}
  const isRoleChange =
    table === 'profiles' && oldRecord && record && oldRecord.role !== record.role
  const color = ROLE_COLOR[a.actor_role] || COLORS.grey
  const ts = a.at || new Date().toISOString()

  let fields: any[]
  if (type === 'UPDATE') {
    fields = diffFields(oldRecord, record)
  } else {
    const r = type === 'DELETE' ? oldRecord : record
    fields = Object.entries(r || {})
      .filter(([k, v]) => v !== null && v !== undefined && typeof v !== 'object' && !AUDIT_SKIP.has(k))
      .slice(0, 10)
      .map(([k, v]) => field(k, v))
  }

  const target = rowLabel(type === 'DELETE' ? oldRecord : record)
  const title = isRoleChange ? '🛡️ Changement de rôle' : `🛠️ Action staff · ${table}`

  return {
    title,
    color,
    description:
      `**${truncate(a.actor_name, 80)}** (${a.actor_role || '?'}) ${verb} ` +
      `\`${table}\` → **${truncate(target, 100)}**`,
    fields: fields.length ? fields : [field('Détail', '(aucun champ pertinent)', false)],
    timestamp: ts,
    footer: { text: `Mob Y Dick · audit · ${type} · acteur ${a.actor_id || '?'}` },
  }
}

async function postToDiscord(embed: any): Promise<{ ok: boolean; status: number; detail?: string }> {
  if (!DISCORD_WEBHOOK_URL) return { ok: false, status: 500, detail: 'missing_webhook_url' }
  const resp = await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'Mob Y Dick — Alertes',
      embeds: [embed],
    }),
  })
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '')
    return { ok: false, status: resp.status, detail: detail.slice(0, 500) }
  }
  return { ok: true, status: resp.status }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  let body: any
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'invalid_json' })
  }

  const providedSecret =
    req.headers.get('x-alert-secret') || req.headers.get('X-Alert-Secret') || ''

  let embed: any = null

  // ─── 1. Chemin TRIGGER DB (secret partagé) ───
  if (ALERT_SHARED_SECRET && providedSecret && providedSecret === ALERT_SHARED_SECRET) {
    const { type, table, record, old_record, audit } = body || {}
    if (!type || !table) return json(400, { error: 'missing_db_webhook_fields' })
    embed = audit
      ? buildAuditEmbed(String(type), String(table), record, old_record, audit)
      : buildDbEmbed(String(type), String(table), record, old_record)
  } else if (providedSecret) {
    // Un secret a été fourni mais il est faux → on rejette (anti-bruteforce léger)
    return json(401, { error: 'invalid_secret' })
  } else {
    // ─── 2. Chemin FRONT (allowlist + rate-limit) ───
    // L'apikey anon est PUBLIQUE (présente dans le bundle client) : la comparer
    // n'apporte quasi aucune sécurité. La vraie protection ici = allowlist
    // d'events autorisés + rate-limit + caps de longueur. On exige juste la
    // présence d'une apikey/Authorization (filtre les sondes triviales).
    const apikey =
      req.headers.get('apikey') ||
      (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    if (!apikey) {
      return json(401, { error: 'unauthorized' })
    }
    const event = String(body?.event || '')
    const ip =
      (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
    if (rateLimited(`${ip}:${event}`)) {
      return json(429, { error: 'rate_limited' })
    }
    embed = buildCustomEmbed(body)
    if (!embed) return json(400, { error: 'event_not_allowed' })
  }

  try {
    const result = await postToDiscord(embed)
    if (!result.ok) {
      console.error('[discord-alert] post failed:', result.status, result.detail)
      return json(502, { error: 'discord_post_failed', status: result.status })
    }
    return json(200, { ok: true })
  } catch (err) {
    console.error('[discord-alert] exception:', err)
    return json(500, { error: 'internal_error' })
  }
})
