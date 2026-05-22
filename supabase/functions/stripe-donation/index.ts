/**
 * stripe-donation — Supabase Edge Function
 *
 * Crée et finalise tout paiement Stripe (dons / achats premium / commandes
 * boutique). Gère AUSSI les webhooks Stripe (anti-perte de paiement).
 *
 * ─── Actions front (POST JSON avec `action`) ───
 *   - create-intent             → PaymentIntent don
 *   - finalize                  → finalise un don (post confirmCardPayment)
 *   - create-purchase-intent    → PaymentIntent achat emote premium
 *   - finalize-purchase         → finalise un achat
 *   - create-order-intent       → PaymentIntent commande boutique
 *   - finalize-order            → finalise une commande
 *   - admin-simulate-donation   → simu admin (insert directement en DB)
 *
 * ─── Webhook (POST avec header Stripe-Signature, AUCUN body.action) ───
 *   Stripe POST sur cette URL pour les events payment_intent.succeeded.
 *   Fallback SI le client a fermé sa tab entre confirm et finalize :
 *   le webhook insère le don/achat/commande à la place du client. Idempotent
 *   grâce aux contraintes UNIQUE sur paypal_order_id.
 *
 * ─── Secrets requis (Supabase Dashboard → Settings → Edge Functions) ───
 *   STRIPE_SECRET_KEY      = sk_live_... ou sk_test_...
 *   STRIPE_WEBHOOK_SECRET  = whsec_... (Stripe Dashboard → Webhooks → ton
 *                            endpoint → "Signing secret")
 *
 * ─── Setup webhook Stripe (à faire UNE fois côté Stripe Dashboard) ───
 *   1. Stripe Dashboard → Developers → Webhooks → Add endpoint
 *   2. URL : https://<project>.supabase.co/functions/v1/stripe-donation
 *   3. Events : `payment_intent.succeeded`
 *   4. Copier "Signing secret" → coller dans Supabase secret STRIPE_WEBHOOK_SECRET
 *   5. Redeploy : `supabase functions deploy stripe-donation --no-verify-jwt`
 *
 * ─── Setup côté front ───
 *   VITE_STRIPE_PUBLISHABLE_KEY = pk_live_... ou pk_test_... (Vercel env)
 *
 * ─── Deploy ───
 *   supabase functions deploy stripe-donation --no-verify-jwt
 *   (no-verify-jwt car les dons peuvent être anonymes ET le webhook Stripe
 *   n'envoie pas de JWT Supabase. La sécurité = vérif Stripe-Signature.)
 */
// @ts-nocheck — environnement Deno Edge Function
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!
// Webhook secret (configuré dans Stripe Dashboard → Webhooks → ton endpoint
// → "Signing secret"). Préfixe whsec_... Sans ça, on rejette les webhooks
// pour éviter qu'un attaquant ne forge des événements payment_intent.succeeded.
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') || ''

const STRIPE_API = 'https://api.stripe.com/v1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

/**
 * Stripe API utilise application/x-www-form-urlencoded pour les requêtes.
 * Helper qui sérialise correctement les objets imbriqués (metadata[key]=val).
 */
function toFormBody(params: Record<string, unknown>, prefix = ''): string {
  const pairs: string[] = []
  for (const [k, v] of Object.entries(params)) {
    const key = prefix ? `${prefix}[${k}]` : k
    if (v === null || v === undefined) continue
    if (typeof v === 'object' && !Array.isArray(v)) {
      pairs.push(toFormBody(v as Record<string, unknown>, key))
    } else {
      pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`)
    }
  }
  return pairs.filter(Boolean).join('&')
}

async function stripeRequest(path: string, body?: Record<string, unknown>) {
  const init: RequestInit = {
    method: body ? 'POST' : 'GET',
    headers: {
      'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  }
  if (body) init.body = toFormBody(body)
  const resp = await fetch(`${STRIPE_API}${path}`, init)
  const data = await resp.json()
  if (!resp.ok) {
    const msg = data.error?.message || `Stripe ${resp.status}`
    throw new Error(msg)
  }
  return data
}

// ──────────────────────────────────────
// Vérification de signature Stripe (HMAC-SHA256)
// Format du header Stripe-Signature : `t=1234567890,v1=hash,v0=hash2`
// On signe `${t}.${rawBody}` avec STRIPE_WEBHOOK_SECRET et on compare au `v1`.
// Anti-replay : timestamp < 5min ; comparaison en temps constant pour éviter
// les attaques par timing.
// ──────────────────────────────────────
async function verifyStripeSignature(rawBody: string, sigHeader: string, secret: string): Promise<boolean> {
  if (!secret) return false
  const parts: Record<string, string> = {}
  for (const item of sigHeader.split(',')) {
    const eq = item.indexOf('=')
    if (eq < 0) continue
    parts[item.slice(0, eq).trim()] = item.slice(eq + 1).trim()
  }
  const timestamp = parts.t
  const signature = parts.v1
  if (!timestamp || !signature) return false
  // Anti-replay : 5 minutes de tolérance dans les deux sens
  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10)
  if (Math.abs(age) > 300) return false

  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${rawBody}`))
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')

  // Comparaison constant-time pour ne pas leaker via timing
  if (hex.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ signature.charCodeAt(i)
  return diff === 0
}

// ──────────────────────────────────────
// Traitement partagé d'un PaymentIntent.succeeded.
// Appelé depuis :
//   - finalize / finalize-purchase / finalize-order (client-driven)
//   - webhook payment_intent.succeeded (server-driven, fail-safe)
// Idempotent grâce aux UNIQUE constraints sur paypal_order_id.
// L'intent doit être passé "enrichi" (avec latest_charge expandé) pour
// remplir card_brand/last4/receipt_url. Le webhook le re-fetch si besoin.
// ──────────────────────────────────────
async function processIntentSucceeded(intent: any, supabase: any) {
  if (intent.status !== 'succeeded') {
    return { ok: false, status: 400, error: 'payment_not_succeeded', detail: intent.status }
  }
  if (intent.currency !== 'eur') {
    return { ok: false, status: 400, error: 'wrong_currency', detail: intent.currency }
  }

  const md = intent.metadata || {}
  const charge = intent.latest_charge && typeof intent.latest_charge === 'object' ? intent.latest_charge : {}
  const cardDetails = charge.payment_method_details?.card || {}
  const cardBrand: string | null = cardDetails.brand || null
  const cardLast4: string | null = cardDetails.last4 || null
  const receiptUrl: string | null = charge.receipt_url || null
  const payerEmail: string | null = charge.billing_details?.email || intent.receipt_email || null

  if (md.kind === 'donation') {
    const { error } = await supabase.from('donations').insert({
      user_id: md.user_id || null,
      display_name: String(md.display_name || 'Donateur Anonyme').slice(0, 80),
      amount_cents: intent.amount,
      message: md.message ? String(md.message).slice(0, 300) : null,
      session_id: md.session_id || null,
      paypal_order_id: intent.id,
      payment_provider: 'stripe',
      payer_email: payerEmail,
      card_brand: cardBrand,
      card_last4: cardLast4,
      receipt_url: receiptUrl,
    })
    if (error?.code === '23505') return { ok: true, duplicate: true, kind: 'donation' }
    if (error) return { ok: false, status: 500, error: 'db_insert_failed', detail: error.message }
    return { ok: true, kind: 'donation', amountCents: intent.amount }
  }

  if (md.kind === 'purchase') {
    if (!md.user_id || !md.item_slug) {
      return { ok: false, status: 400, error: 'missing_metadata' }
    }
    const { error } = await supabase.from('user_purchases').insert({
      user_id: md.user_id,
      item_slug: md.item_slug,
      amount_cents: intent.amount,
      paypal_order_id: intent.id,
      payment_provider: 'stripe',
      card_brand: cardBrand,
      card_last4: cardLast4,
      receipt_url: receiptUrl,
    })
    if (error?.code === '23505') return { ok: true, duplicate: true, kind: 'purchase', itemSlug: md.item_slug }
    if (error) return { ok: false, status: 500, error: 'db_insert_failed', detail: error.message }
    return { ok: true, kind: 'purchase', itemSlug: md.item_slug }
  }

  if (md.kind === 'order') {
    if (!md.user_id) {
      return { ok: false, status: 400, error: 'missing_metadata' }
    }
    const { error } = await supabase.from('orders').insert([{
      product_name: md.product_name,
      price: (intent.amount / 100).toFixed(2) + '€',
      custom_text: md.custom_text || null,
      size: md.size || null,
      customer_name: md.customer_name,
      customer_email: md.customer_email,
      shipping_address: md.shipping_address,
      shipping_city: md.shipping_city,
      shipping_zip: md.shipping_zip,
      shipping_country: md.shipping_country,
      status: 'Paiement Validé',
      user_id: md.user_id,
      paypal_order_id: intent.id,
    }])
    if (error?.code === '23505') return { ok: true, duplicate: true, kind: 'order' }
    if (error) return { ok: false, status: 500, error: 'db_insert_failed', detail: error.message }
    return { ok: true, kind: 'order' }
  }

  return { ok: false, status: 400, error: 'unknown_kind', detail: md.kind || 'none' }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' })
  }

  // ──────────────────────────────────────
  // 0. WEBHOOK STRIPE
  //    Détection par le header Stripe-Signature. C'est l'anti-perte de
  //    paiement : Stripe nous rappelle directement après confirm, même si
  //    le client a fermé sa tab entre temps. Idempotent grâce aux UNIQUE
  //    constraints sur paypal_order_id (donations, user_purchases, orders).
  // ──────────────────────────────────────
  const stripeSig = req.headers.get('stripe-signature') || req.headers.get('Stripe-Signature')
  if (stripeSig) {
    const rawBody = await req.text()
    const valid = await verifyStripeSignature(rawBody, stripeSig, STRIPE_WEBHOOK_SECRET)
    if (!valid) {
      return json(400, { error: 'invalid_signature' })
    }
    let event: any
    try { event = JSON.parse(rawBody) } catch { return json(400, { error: 'invalid_event_json' }) }

    // On ne traite que payment_intent.succeeded ; les autres events
    // (failed, refunded, etc.) sont ignorés pour l'instant — on renvoie
    // 200 pour que Stripe ne les retente pas indéfiniment.
    if (event.type !== 'payment_intent.succeeded') {
      return json(200, { ok: true, ignored: event.type })
    }

    let intent = event.data?.object
    if (!intent?.id) return json(400, { error: 'no_intent_in_event' })

    // Le payload webhook n'inclut pas latest_charge en object (juste l'ID).
    // On re-fetch en GET avec expand pour récupérer card_brand/last4/etc.
    // Si la latence Stripe est trop forte, on insère quand même sans
    // ces détails (mieux vaut un row sans card_brand qu'un don perdu).
    try {
      intent = await stripeRequest(
        `/payment_intents/${encodeURIComponent(intent.id)}?expand[]=latest_charge`,
      )
    } catch {
      // On garde l'intent du webhook même sans latest_charge expanded
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const result = await processIntentSucceeded(intent, supabase)
    // Retour 200 pour Stripe même si l'insert a échoué (sinon Stripe retry
    // sans fin) — on log côté Edge function logs Supabase.
    if (!result.ok) {
      console.error('[webhook] processIntent failed:', result.error, result.detail)
    }
    return json(200, { ok: true, result })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'invalid_json' })
  }

  const { action } = body

  // Récupérer l'auth user si dispo (header Authorization) — utilisé par
  // les 4 actions ci-dessous, on factorise le code en haut.
  let authUserId: string | null = null
  const authHeader = req.headers.get('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    authUserId = data.user?.id ?? null
  }

  // ──────────────────────────────────────
  // 1. CREATE-INTENT (don)
  //    Crée un PaymentIntent Stripe, renvoie le client_secret au front.
  //    Le montant et les métadonnées sont stockés DANS le PaymentIntent
  //    pour qu'à la finalisation on puisse re-vérifier ce qu'on devait
  //    encaisser (anti-tampering : si le front envoie un montant modifié
  //    à la finalize, Stripe a stocké la vraie valeur).
  // ──────────────────────────────────────
  if (action === 'create-intent') {
    const { amountCents, displayName, message, sessionId, payerEmail } = body

    // Validations côté serveur (jamais faire confiance au client)
    if (!Number.isInteger(amountCents) || amountCents < 100 || amountCents > 10000000) {
      return json(400, { error: 'invalid_amount', message: 'Montant entre 1€ et 100 000€' })
    }
    if (!displayName || typeof displayName !== 'string' || displayName.length > 80) {
      return json(400, { error: 'invalid_display_name' })
    }
    if (message && (typeof message !== 'string' || message.length > 300)) {
      return json(400, { error: 'invalid_message' })
    }

    // ── Anti-impersonation : refuser un pseudo déjà pris par un autre user
    //    Si le donateur n'est pas connecté ET le pseudo matche le
    //    display_name d'un user enregistré → bloque. Si le donateur EST
    //    connecté ET son propre display_name matche → autorisé.
    {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      const trimmedName = displayName.trim()
      if (trimmedName.length > 0) {
        // ILIKE = match insensible à la casse. Empêche "jctest" de squatter "JCTest".
        const { data: clash } = await supabase
          .from('profiles')
          .select('id, display_name')
          .ilike('display_name', trimmedName)
          .limit(1)
          .maybeSingle()
        if (clash && clash.id !== authUserId) {
          return json(400, {
            error: 'pseudo_taken',
            message: `Le pseudo "${trimmedName}" est déjà utilisé par un membre. Choisis-en un autre ou connecte-toi.`,
          })
        }
      }
    }
    // Email optionnel — si fourni, on valide (basique)
    let cleanEmail: string | null = null
    if (payerEmail && typeof payerEmail === 'string') {
      const trimmed = payerEmail.trim()
      if (trimmed.length > 254 || !trimmed.includes('@')) {
        return json(400, { error: 'invalid_email' })
      }
      cleanEmail = trimmed
    }

    try {
      const intentBody: Record<string, unknown> = {
        amount: amountCents,
        currency: 'eur',
        // Méthodes de paiement automatiques (Stripe choisit ce qui est dispo
        // pour le pays du donateur : carte, Apple Pay, Google Pay, etc.)
        automatic_payment_methods: { enabled: true },
        description: `Don Mob Y Dick — ${displayName}`,
        // Metadata : stockés sur le PaymentIntent côté Stripe → vérifiable
        // au moment de la finalize sans avoir à se fier au client.
        metadata: {
          display_name: displayName,
          message: message || '',
          session_id: sessionId || '',
          user_id: authUserId || '',
          kind: 'donation',
        },
      }
      // Email pour reçu Stripe automatique
      if (cleanEmail) intentBody.receipt_email = cleanEmail

      const intent = await stripeRequest('/payment_intents', intentBody)
      return json(200, {
        clientSecret: intent.client_secret,
        paymentIntentId: intent.id,
      })
    } catch (err) {
      return json(502, { error: 'stripe_create_failed', detail: String(err.message || err) })
    }
  }

  // ──────────────────────────────────────
  // 2. FINALIZE
  //    Vérifie le PaymentIntent côté Stripe (status='succeeded') puis
  //    insère dans donations. Idempotent : si on retente avec le même
  //    payment_intent_id, on ne crée pas de doublon (UNIQUE constraint).
  // ──────────────────────────────────────
  if (action === 'finalize') {
    const { paymentIntentId } = body
    if (!paymentIntentId || typeof paymentIntentId !== 'string') {
      return json(400, { error: 'missing_payment_intent_id' })
    }

    // On récupère le PaymentIntent + son latest_charge (qui contient la
    // marque de carte, last4, receipt_url, email du payeur). Le paramètre
    // expand[]=latest_charge demande à Stripe de nous inclure cet objet
    // directement (sinon on aurait juste l'ID et il faudrait un 2e appel).
    let intent: any
    try {
      intent = await stripeRequest(
        `/payment_intents/${encodeURIComponent(paymentIntentId)}?expand[]=latest_charge`
      )
    } catch (err) {
      return json(502, { error: 'stripe_fetch_failed', detail: String(err.message || err) })
    }

    if (intent.status !== 'succeeded') {
      return json(400, { error: 'payment_not_succeeded', status: intent.status })
    }
    if (intent.currency !== 'eur') {
      return json(400, { error: 'wrong_currency', currency: intent.currency })
    }

    // Extraction des infos enrichies depuis le charge
    const charge = intent.latest_charge || {}
    const cardDetails = charge.payment_method_details?.card || {}
    const cardBrand: string | null = cardDetails.brand || null
    const cardLast4: string | null = cardDetails.last4 || null
    const receiptUrl: string | null = charge.receipt_url || null
    // Email : soit billing_details.email (saisi par Stripe via 3DS),
    // soit receipt_email (qu'on a passé à create-intent), soit null
    const payerEmail: string | null =
      charge.billing_details?.email
      || intent.receipt_email
      || null

    const md = intent.metadata || {}
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // On utilise paypal_order_id pour stocker le payment_intent_id Stripe
    // (la colonne existe déjà et a une UNIQUE constraint via v20 →
    // idempotence automatique en cas de retry). Le payment_provider
    // distingue stripe vs paypal pour l'affichage admin.
    const { error: insertErr } = await supabase.from('donations').insert({
      user_id: md.user_id || null,
      display_name: (md.display_name || 'Donateur Anonyme').slice(0, 80),
      amount_cents: intent.amount,
      message: md.message ? String(md.message).slice(0, 300) : null,
      session_id: md.session_id || null,
      paypal_order_id: paymentIntentId,
      payment_provider: 'stripe',
      payer_email: payerEmail,
      card_brand: cardBrand,
      card_last4: cardLast4,
      receipt_url: receiptUrl,
    })

    if (insertErr) {
      if (insertErr.code === '23505') {
        // Duplicate → idempotent retry, on dit OK
        return json(200, { ok: true, duplicate: true })
      }
      return json(500, { error: 'db_insert_failed', detail: insertErr.message })
    }

    return json(200, { ok: true, amountCents: intent.amount })
  }

  // ──────────────────────────────────────
  // 3. CREATE-PURCHASE-INTENT (achat d'une emote premium)
  //    Le user achète un item dont le prix est fixé en DB (shop_items).
  //    On NE FAIT PAS CONFIANCE au montant envoyé par le client : on
  //    relit le prix depuis shop_items et on l'utilise pour le Stripe
  //    PaymentIntent. Le client_secret est ensuite confirmé par le front,
  //    puis finalize-purchase débloque l'emote pour le user.
  // ──────────────────────────────────────
  if (action === 'create-purchase-intent') {
    if (!authUserId) return json(401, { error: 'auth_required_for_purchase' })

    const { itemSlug } = body
    if (!itemSlug || typeof itemSlug !== 'string') {
      return json(400, { error: 'missing_item_slug' })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Vérifier que l'item existe, est visible, et récupérer son prix officiel
    const { data: item, error: itemErr } = await supabase
      .from('shop_items')
      .select('slug, name, price_cents, is_visible')
      .eq('slug', itemSlug)
      .maybeSingle()
    if (itemErr || !item) return json(400, { error: 'item_not_found' })
    if (!item.is_visible) return json(400, { error: 'item_not_purchasable' })
    if (!item.price_cents || item.price_cents < 100) {
      return json(400, { error: 'invalid_item_price' })
    }

    // Vérifier que le user ne possède pas déjà cet item (évite les
    // débits multiples accidentels — l'UI front filtre déjà mais on
    // re-vérifie côté serveur).
    const { data: existing } = await supabase
      .from('user_purchases')
      .select('id')
      .eq('user_id', authUserId)
      .eq('item_slug', itemSlug)
      .maybeSingle()
    if (existing) return json(400, { error: 'already_owned' })

    try {
      const intent = await stripeRequest('/payment_intents', {
        amount: item.price_cents, // ← prix SERVEUR, pas celui du client
        currency: 'eur',
        automatic_payment_methods: { enabled: true },
        description: `Achat emote ${item.name} — Mob Y Dick`,
        metadata: {
          user_id: authUserId,
          item_slug: itemSlug,
          kind: 'purchase',
        },
      })
      return json(200, {
        clientSecret: intent.client_secret,
        paymentIntentId: intent.id,
      })
    } catch (err) {
      return json(502, { error: 'stripe_create_failed', detail: String(err.message || err) })
    }
  }

  // ──────────────────────────────────────
  // 4. FINALIZE-PURCHASE (débloque l'emote)
  //    Vérifie le PaymentIntent côté Stripe puis insère dans user_purchases.
  //    Idempotent grâce au UNIQUE(user_id, item_slug) de la table.
  // ──────────────────────────────────────
  if (action === 'finalize-purchase') {
    if (!authUserId) return json(401, { error: 'auth_required_for_purchase' })

    const { paymentIntentId } = body
    if (!paymentIntentId || typeof paymentIntentId !== 'string') {
      return json(400, { error: 'missing_payment_intent_id' })
    }

    let intent: any
    try {
      intent = await stripeRequest(
        `/payment_intents/${encodeURIComponent(paymentIntentId)}?expand[]=latest_charge`
      )
    } catch (err) {
      return json(502, { error: 'stripe_fetch_failed', detail: String(err.message || err) })
    }

    if (intent.status !== 'succeeded') {
      return json(400, { error: 'payment_not_succeeded', status: intent.status })
    }
    if (intent.currency !== 'eur') {
      return json(400, { error: 'wrong_currency', currency: intent.currency })
    }

    const md = intent.metadata || {}
    if (md.kind !== 'purchase') {
      return json(400, { error: 'wrong_intent_kind' })
    }
    if (md.user_id !== authUserId) {
      return json(403, { error: 'user_mismatch' })
    }
    if (!md.item_slug) {
      return json(400, { error: 'missing_item_slug_in_intent' })
    }

    const charge = intent.latest_charge || {}
    const cardDetails = charge.payment_method_details?.card || {}

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { error: insertErr } = await supabase.from('user_purchases').insert({
      user_id: authUserId,
      item_slug: md.item_slug,
      amount_cents: intent.amount,
      paypal_order_id: paymentIntentId,
      payment_provider: 'stripe',
      card_brand: cardDetails.brand || null,
      card_last4: cardDetails.last4 || null,
      receipt_url: charge.receipt_url || null,
    })

    if (insertErr) {
      if (insertErr.code === '23505') {
        return json(200, { ok: true, duplicate: true, itemSlug: md.item_slug })
      }
      return json(500, { error: 'db_insert_failed', detail: insertErr.message })
    }

    return json(200, { ok: true, itemSlug: md.item_slug })
  }

  // ──────────────────────────────────────
  // 5. CREATE-ORDER-INTENT (achat dans la boutique)
  // ──────────────────────────────────────
  if (action === 'create-order-intent') {
    if (!authUserId) return json(401, { error: 'auth_required_for_order' })

    const { productId, customText, size, customerName, customerEmail, shippingAddress, shippingCity, shippingZip, shippingCountry } = body
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: product, error: prodErr } = await supabase
      .from('products')
      .select('name, price')
      .eq('id', productId)
      .maybeSingle()
      
    if (prodErr || !product) return json(400, { error: 'product_not_found' })
    
    // Convert string price like '35€' to cents
    const parsedPriceStr = String(product.price).replace(/[^0-9.]/g, '')
    const amountCents = Math.round(parseFloat(parsedPriceStr) * 100)
    
    if (!amountCents || amountCents < 100) return json(400, { error: 'invalid_product_price' })

    try {
      const intent = await stripeRequest('/payment_intents', {
        amount: amountCents,
        currency: 'eur',
        automatic_payment_methods: { enabled: true },
        description: `Commande ${product.name} — Mob Y Dick`,
        metadata: {
          user_id: authUserId,
          product_name: product.name,
          custom_text: customText || '',
          size: size || '',
          customer_name: customerName,
          customer_email: customerEmail,
          shipping_address: shippingAddress,
          shipping_city: shippingCity,
          shipping_zip: shippingZip,
          shipping_country: shippingCountry,
          kind: 'order',
        },
        receipt_email: customerEmail,
      })
      return json(200, {
        clientSecret: intent.client_secret,
        paymentIntentId: intent.id,
      })
    } catch (err) {
      return json(502, { error: 'stripe_create_failed', detail: String(err.message || err) })
    }
  }

  // ──────────────────────────────────────
  // 6. FINALIZE-ORDER
  // ──────────────────────────────────────
  if (action === 'finalize-order') {
    if (!authUserId) return json(401, { error: 'auth_required_for_order' })

    const { paymentIntentId } = body
    if (!paymentIntentId || typeof paymentIntentId !== 'string') {
      return json(400, { error: 'missing_payment_intent_id' })
    }

    let intent: any
    try {
      intent = await stripeRequest(
        `/payment_intents/${encodeURIComponent(paymentIntentId)}?expand[]=latest_charge`
      )
    } catch (err) {
      return json(502, { error: 'stripe_fetch_failed', detail: String(err.message || err) })
    }

    if (intent.status !== 'succeeded') {
      return json(400, { error: 'payment_not_succeeded', status: intent.status })
    }

    const md = intent.metadata || {}
    if (md.kind !== 'order') {
      return json(400, { error: 'wrong_intent_kind' })
    }
    if (md.user_id !== authUserId) {
      return json(403, { error: 'user_mismatch' })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const orderPayload = {
      product_name: md.product_name,
      price: (intent.amount / 100).toFixed(2) + '€',
      custom_text: md.custom_text || null,
      size: md.size || null,
      customer_name: md.customer_name,
      customer_email: md.customer_email,
      shipping_address: md.shipping_address,
      shipping_city: md.shipping_city,
      shipping_zip: md.shipping_zip,
      shipping_country: md.shipping_country,
      status: 'Paiement Validé',
      user_id: authUserId,
      paypal_order_id: paymentIntentId,
    }

    const { error: insertErr } = await supabase.from('orders').insert([orderPayload])
    if (insertErr) {
      if (insertErr.code === '23505') {
        return json(200, { ok: true, duplicate: true })
      }
      return json(500, { error: 'db_insert_failed', detail: insertErr.message })
    }

    return json(200, { ok: true })
  }

  // ──────────────────────────────────────
  // 7. ADMIN-SIMULATE-DONATION
  //    Joue juste l'animation de don sur le live sans rien stocker en DB
  //    (l'admin veut tester l'overlay, pas polluer l'historique).
  //
  //    Sécurité : on broadcast côté serveur via la HTTP Realtime API en
  //    service_role. Comme c'est l'edge function qui émet (après vérif
  //    admin), un viewer ne peut PAS falsifier en envoyant lui-même un
  //    broadcast `donation-simu` depuis sa console (sauf à passer par
  //    cette même action — laquelle exige `role='admin'`).
  //
  //    Le front s'abonne à `donation-simu` sur le channel `live-extras-${sid}`
  //    et déclenche `triggerDonationAlert` avec un faux row éphémère.
  // ──────────────────────────────────────
  if (action === 'admin-simulate-donation') {
    if (!authUserId) return json(401, { error: 'auth_required' })

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Re-check admin role côté serveur (le check client n'est qu'UI-gating)
    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', authUserId).maybeSingle()
    if (profile?.role !== 'admin') {
      return json(403, { error: 'admin_required' })
    }

    const { displayName, amountCents, message, sessionId } = body
    if (!displayName || typeof displayName !== 'string') {
      return json(400, { error: 'missing_display_name' })
    }
    const amt = parseInt(amountCents, 10)
    if (!Number.isFinite(amt) || amt < 1 || amt > 10000000) {
      return json(400, { error: 'invalid_amount' })
    }
    if (!sessionId || typeof sessionId !== 'string') {
      return json(400, { error: 'missing_session_id' })
    }

    // Broadcast direct via l'API HTTP Realtime de Supabase. Ça relaie
    // à tous les clients abonnés à `live-extras-${sessionId}` sur l'event
    // `donation-simu` sans jamais toucher la BDD.
    try {
      const resp = await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{
            topic: `live-extras-${sessionId}`,
            event: 'donation-simu',
            payload: {
              id: `simu-${Date.now()}-${authUserId.slice(0, 8)}`,
              display_name: displayName.slice(0, 80),
              amount_cents: amt,
              message: message ? String(message).slice(0, 300) : null,
            },
          }],
        }),
      })
      if (!resp.ok) {
        const detail = await resp.text()
        return json(502, { error: 'broadcast_failed', detail })
      }
    } catch (err) {
      return json(502, { error: 'broadcast_failed', detail: String(err.message || err) })
    }
    return json(200, { ok: true, simulated: true })
  }

  return json(400, { error: 'unknown_action' })
})
