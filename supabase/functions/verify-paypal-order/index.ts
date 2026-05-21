/**
 * verify-paypal-order — Supabase Edge Function
 *
 * Vérifie côté SERVEUR qu'un order PayPal est bien `COMPLETED` et que
 * son montant correspond à ce que le client annonce, AVANT de l'insérer
 * dans `donations` ou `user_purchases`. Sans cette function, un user
 * peut bypasser PayPal et insérer directement via supabase-js depuis
 * la console (cf. audit sécurité #1 et #2).
 *
 * ─── Setup ───
 * 1. Côté Supabase Dashboard → Settings → Edge Functions :
 *      - PAYPAL_CLIENT_ID = "AT6gLyO..." (le même que dans PayPalButton.jsx)
 *      - PAYPAL_SECRET    = le secret API PayPal (à récupérer sur
 *        https://developer.paypal.com/dashboard/applications/)
 *      - PAYPAL_API_BASE  = "https://api-m.paypal.com" pour la prod,
 *                          "https://api-m.sandbox.paypal.com" pour les tests
 *
 * 2. Déployer depuis ton terminal local :
 *      cd Site_Web
 *      supabase functions deploy verify-paypal-order --no-verify-jwt
 *
 *    (no-verify-jwt = on accepte les appels anonymes car les dons peuvent
 *    être faits sans compte. L'auth réelle = vérification PayPal.)
 *
 * 3. Côté front, appeler via :
 *      supabase.functions.invoke('verify-paypal-order', {
 *        body: { kind: 'donation', orderId, expectedAmountCents, displayName, message, sessionId }
 *      })
 *
 * ─── Sécurité ───
 * Cette function utilise SUPABASE_SERVICE_ROLE_KEY pour insérer dans
 * donations/user_purchases en bypassant les RLS. Une fois en place,
 * exécuter v21 (migration suivante) qui retire les `WITH CHECK (true)`
 * et n'autorise plus QUE le service_role à insérer.
 */
// @ts-nocheck — environnement Deno côté Edge Function
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PAYPAL_CLIENT_ID = Deno.env.get('PAYPAL_CLIENT_ID')!
const PAYPAL_SECRET = Deno.env.get('PAYPAL_SECRET')!
const PAYPAL_API_BASE = Deno.env.get('PAYPAL_API_BASE') || 'https://api-m.paypal.com'

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

// ─── Cache du token OAuth PayPal (valide ~9h) ───
let cachedToken: { value: string; expiresAt: number } | null = null

async function getPaypalToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value
  }
  const auth = btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`)
  const resp = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!resp.ok) throw new Error(`PayPal auth failed: ${resp.status}`)
  const data = await resp.json()
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000),
  }
  return data.access_token
}

async function fetchPaypalOrder(orderId: string) {
  const token = await getPaypalToken()
  const resp = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  if (resp.status === 404) return null
  if (!resp.ok) throw new Error(`PayPal order fetch failed: ${resp.status}`)
  return resp.json()
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'invalid_json' })
  }

  const { kind, orderId, expectedAmountCents } = body
  if (!orderId || typeof orderId !== 'string') {
    return json(400, { error: 'missing_order_id' })
  }
  if (!['donation', 'purchase'].includes(kind)) {
    return json(400, { error: 'invalid_kind' })
  }

  // ─── 1. Vérifier l'order auprès de PayPal ───
  let order
  try {
    order = await fetchPaypalOrder(orderId)
  } catch (err) {
    return json(502, { error: 'paypal_unreachable', detail: String(err) })
  }
  if (!order) return json(404, { error: 'order_not_found' })
  if (order.status !== 'COMPLETED') {
    return json(400, { error: 'order_not_completed', status: order.status })
  }

  // ─── 2. Vérifier le montant ───
  const unit = order.purchase_units?.[0]
  const captures = unit?.payments?.captures || []
  const captured = captures.find((c: any) => c.status === 'COMPLETED')
  if (!captured) return json(400, { error: 'no_completed_capture' })

  const paidCents = Math.round(parseFloat(captured.amount.value) * 100)
  const currency = captured.amount.currency_code
  if (currency !== 'EUR') {
    return json(400, { error: 'wrong_currency', currency })
  }
  if (expectedAmountCents && Math.abs(paidCents - expectedAmountCents) > 1) {
    return json(400, { error: 'amount_mismatch', paid: paidCents, expected: expectedAmountCents })
  }

  // ─── 3. Insérer en DB via service_role (bypass RLS) ───
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Optionnel : récupérer l'auth user si dispo (header Authorization)
  let authUserId: string | null = null
  const authHeader = req.headers.get('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const userResp = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    authUserId = userResp.data.user?.id ?? null
  }

  if (kind === 'donation') {
    const { displayName, message, sessionId } = body
    if (!displayName || typeof displayName !== 'string') {
      return json(400, { error: 'missing_display_name' })
    }
    if (displayName.length > 80) return json(400, { error: 'display_name_too_long' })
    if (message && message.length > 300) return json(400, { error: 'message_too_long' })

    const { error } = await supabase.from('donations').insert({
      user_id: authUserId,
      display_name: displayName.slice(0, 80),
      amount_cents: paidCents,
      message: message ? message.slice(0, 300) : null,
      session_id: sessionId || null,
      paypal_order_id: orderId,
    })
    if (error) {
      // Duplicate (v20 UNIQUE constraint) = idempotent retry, on dit OK
      if (error.code === '23505') return json(200, { ok: true, duplicate: true })
      return json(500, { error: 'db_insert_failed', detail: error.message })
    }
    return json(200, { ok: true, amountCents: paidCents })
  }

  if (kind === 'purchase') {
    const { itemSlug } = body
    if (!authUserId) return json(401, { error: 'auth_required_for_purchase' })
    if (!itemSlug || typeof itemSlug !== 'string') {
      return json(400, { error: 'missing_item_slug' })
    }
    // Vérifier que l'item existe et que le prix payé est cohérent
    const { data: item, error: itemErr } = await supabase
      .from('shop_items').select('slug, price_cents, is_visible')
      .eq('slug', itemSlug).maybeSingle()
    if (itemErr || !item) return json(400, { error: 'item_not_found' })
    if (!item.is_visible) return json(400, { error: 'item_not_purchasable' })
    if (Math.abs(paidCents - item.price_cents) > 1) {
      return json(400, { error: 'price_mismatch', paid: paidCents, expected: item.price_cents })
    }

    const { error } = await supabase.from('user_purchases').insert({
      user_id: authUserId,
      item_slug: itemSlug,
      amount_cents: paidCents,
      paypal_order_id: orderId,
    })
    if (error) {
      if (error.code === '23505') return json(200, { ok: true, duplicate: true })
      return json(500, { error: 'db_insert_failed', detail: error.message })
    }
    return json(200, { ok: true, itemSlug })
  }

  return json(400, { error: 'unhandled' })
})
