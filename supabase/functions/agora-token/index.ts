/**
 * agora-token — Supabase Edge Function
 *
 * Génère un RTC token Agora pour rejoindre un canal de live stream.
 * Nécessaire dès que le projet Agora bascule en "Secured Mode" (App ID + Token).
 *
 * ─── Action front (POST JSON) ───
 *   { channelName: "live-stream-<uuid>", uid: "<auth.uid>", role: "publisher"|"audience" }
 *
 *   - channelName : doit matcher `live-stream-<raceSessionId>` (sinon 400).
 *   - uid         : UID Agora (UUID Supabase ou autre string). Doit matcher
 *                    EXACTEMENT celui passé à client.join() côté front.
 *   - role        : "publisher" pour l'organisateur qui diffuse,
 *                    "audience" pour les spectateurs.
 *                    (Optionnel : default "publisher" — les spectateurs en mode
 *                    "live" peuvent souvent rejoindre sans token, mais on
 *                    expose la possibilité au cas où.)
 *
 * ─── Secrets requis ───
 *   AGORA_APP_ID          = 32-char hex (identique à VITE_AGORA_APP_ID côté front)
 *   AGORA_APP_CERTIFICATE = 32-char hex (Console Agora → Project → Primary Certificate)
 *
 * ─── Deploy ───
 *   supabase functions deploy agora-token
 *   supabase secrets set AGORA_APP_ID=... AGORA_APP_CERTIFICATE=...
 *
 * ─── Sécurité ───
 *   - verify_jwt par défaut : seuls les utilisateurs authentifiés peuvent
 *     demander un token (évite que n'importe qui spamme la function).
 *   - Le token expire après TOKEN_TTL_SECONDS (24h).
 *   - On NE vérifie PAS encore que l'appelant est bien l'organisateur de la
 *     race_session du channelName — c'est un TODO pour durcir (lookup
 *     race_sessions.created_by = auth.uid()).
 */
// @ts-nocheck — environnement Deno Edge Function
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { RtcTokenBuilder, RtcRole } from 'https://esm.sh/agora-token@2.0.5'

const AGORA_APP_ID = Deno.env.get('AGORA_APP_ID')!
const AGORA_APP_CERTIFICATE = Deno.env.get('AGORA_APP_CERTIFICATE')!

const TOKEN_TTL_SECONDS = 24 * 3600 // 24h

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' })
  }

  if (!AGORA_APP_ID || !AGORA_APP_CERTIFICATE) {
    return json(500, { error: 'missing_secrets', detail: 'AGORA_APP_ID ou AGORA_APP_CERTIFICATE non configurés sur la function.' })
  }

  let body: { channelName?: string; uid?: string; role?: string }
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'invalid_json' })
  }

  const channelName = body.channelName?.trim()
  const uid = body.uid?.trim()
  const role = body.role === 'audience' ? RtcRole.SUBSCRIBER : RtcRole.PUBLISHER

  if (!channelName || !channelName.startsWith('live-stream-')) {
    return json(400, { error: 'invalid_channel_name', detail: 'channelName doit commencer par "live-stream-".' })
  }
  if (!uid) {
    return json(400, { error: 'missing_uid' })
  }

  const now = Math.floor(Date.now() / 1000)
  const expireTs = now + TOKEN_TTL_SECONDS

  try {
    const token = RtcTokenBuilder.buildTokenWithUserAccount(
      AGORA_APP_ID,
      AGORA_APP_CERTIFICATE,
      channelName,
      uid,
      role,
      expireTs,
      expireTs,
    )

    return json(200, {
      token,
      expiresAt: expireTs,
      channelName,
      uid,
    })
  } catch (err) {
    console.error('[agora-token] build failed:', err)
    return json(500, { error: 'token_build_failed', detail: err?.message || String(err) })
  }
})
