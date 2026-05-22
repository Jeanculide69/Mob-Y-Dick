/**
 * stripe-donation — Supabase Edge Function (Stripe Checkout)
 *
 * ⚠️ NOM LEGACY : le dossier s'appelle encore `stripe-donation` pour préserver
 * l'URL du webhook Stripe (déjà configurée dans le Stripe Dashboard pointant
 * sur `/functions/v1/stripe-donation`). Côté business, cette function ne gère
 * QUE des achats à prix fixe — aucun "don à montant libre" depuis v26.
 *
 * Pivot Stripe compliance (mai 2026) : suite à un avertissement Stripe sur
 * les Restricted Businesses (cagnotte/financement participatif), les actions
 * `create-intent` et `finalize` (anciens montants libres) ont été supprimées.
 * Tout passe désormais par des produits/services référencés dans `shop_items`.
 *
 * ─── Actions front (POST JSON avec `action`) ───
 *   - create-purchase-intent  → PaymentIntent pour un produit shop_items
 *                                (emote, dédicace, sponsoring) à prix fixe.
 *                                Accepte customMessage/displayName/sessionId
 *                                pour les items avec allows_custom_message.
 *                                Achat anonyme autorisé si category != 'emote'.
 *   - finalize-purchase       → finalise l'achat (insert user_purchases +
 *                                live_messages si allows_custom_message)
 *   - create-order-intent     → PaymentIntent pour la boutique merch physique
 *   - finalize-order          → finalise une commande merch
 *   - admin-simulate-purchase → simu admin (broadcast sans débit ni DB write)
 *
 * ─── Webhook (POST avec header Stripe-Signature, AUCUN body.action) ───
 *   Stripe POST sur cette URL pour les events payment_intent.succeeded.
 *   Anti-perte de paiement : si le client ferme sa tab entre confirm et
 *   finalize, le webhook insère à sa place. Idempotent via les contraintes
 *   UNIQUE sur paypal_order_id (= payment_intent_id Stripe).
 *
 * ─── Secrets requis ───
 *   STRIPE_SECRET_KEY      = sk_live_... ou sk_test_...
 *   STRIPE_WEBHOOK_SECRET  = whsec_... (Stripe Dashboard → Webhooks)
 *
 * ─── Deploy ───
 *   supabase functions deploy stripe-donation --no-verify-jwt
 *   (no-verify-jwt car certains achats sont anonymes ET le webhook Stripe
 *   n'envoie pas de JWT Supabase. La sécurité = vérif Stripe-Signature +
 *   service_role bypass RLS.)
 */
// @ts-nocheck — environnement Deno Edge Function
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!
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
// Anti-replay : timestamp < 5min ; comparaison en temps constant.
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

  if (hex.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ signature.charCodeAt(i)
  return diff === 0
}

/**
 * Insère une ligne dans live_messages quand un achat avec
 * allows_custom_message=true se finalise. C'est ce que le bot TTS lit à
 * l'antenne. Pour les achats sans message custom (ex: emote premium), pas
 * d'insertion ici (l'animation visuelle suffit, pas de lecture vocale).
 *
 * Retourne null si pas d'insert nécessaire, sinon la row insérée (ou
 * duplicate=true en cas de retry).
 */
async function maybeInsertLiveMessage(supabase: any, params: {
  itemSlug: string
  userPurchaseId: string
  userId: string | null
  displayName: string
  customMessage: string | null
  amountCents: number
  sessionId: string | null
  paymentIntentId: string
  cardBrand: string | null
  cardLast4: string | null
  receiptUrl: string | null
  payerEmail: string | null
  allowsCustomMessage: boolean
}) {
  // Si l'item n'autorise pas de message custom, pas de live_message
  // (les emotes "consommables" déclenchent juste l'animation visuelle
  // côté front via realtime user_purchases, pas via live_messages).
  if (!params.allowsCustomMessage) return null

  const { error } = await supabase.from('live_messages').insert({
    user_id: params.userId,
    display_name: params.displayName.slice(0, 80),
    amount_cents: params.amountCents,
    message: params.customMessage ? params.customMessage.slice(0, 300) : null,
    session_id: params.sessionId,
    paypal_order_id: params.paymentIntentId, // legacy column name, contient pi_xxx Stripe
    payment_provider: 'stripe',
    payer_email: params.payerEmail,
    card_brand: params.cardBrand,
    card_last4: params.cardLast4,
    receipt_url: params.receiptUrl,
    item_slug: params.itemSlug,
    user_purchase_id: params.userPurchaseId,
    is_legacy_donation: false,
  })
  if (error?.code === '23505') return { duplicate: true }
  if (error) throw new Error('live_messages insert failed: ' + error.message)
  return { duplicate: false }
}

// ──────────────────────────────────────
// Traitement partagé d'un PaymentIntent.succeeded.
// Appelé depuis finalize-purchase / finalize-order (client-driven) et
// depuis le webhook (server-driven, fail-safe). Idempotent via UNIQUE
// constraints sur paypal_order_id.
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

  if (md.kind === 'purchase') {
    if (!md.item_slug) return { ok: false, status: 400, error: 'missing_item_slug' }

    // Re-lit l'item pour récupérer allows_custom_message (le metadata ne
    // garde que les bools simples ; on préfère re-checker la DB qui est la
    // source de vérité — un admin peut avoir basculé l'item entre la
    // création du PI et l'arrivée du webhook).
    const { data: item } = await supabase
      .from('shop_items')
      .select('allows_custom_message, repeatable, category')
      .eq('slug', md.item_slug)
      .maybeSingle()
    const allowsMsg = !!item?.allows_custom_message

    // user_id peut être vide string ('') pour les achats anonymes (un
    // visiteur non connecté qui paie une dédicace). NULL en DB.
    const userId = md.user_id && md.user_id !== '' ? md.user_id : null

    const { data: purchaseRow, error: insertErr } = await supabase
      .from('user_purchases')
      .insert({
        user_id: userId,
        item_slug: md.item_slug,
        amount_cents: intent.amount,
        paypal_order_id: intent.id,
        payment_provider: 'stripe',
        card_brand: cardBrand,
        card_last4: cardLast4,
        receipt_url: receiptUrl,
        display_name: md.display_name || null,
        custom_message: md.message || null,
        session_id: md.session_id && md.session_id !== '' ? md.session_id : null,
      })
      .select('id')
      .maybeSingle()

    if (insertErr?.code === '23505') {
      // Retry idempotent : la ligne existe déjà (créée par webhook ou
      // finalize concurrent). On retrouve son id pour pouvoir éventuellement
      // attacher un live_message (si pas déjà inséré).
      const { data: existing } = await supabase
        .from('user_purchases')
        .select('id')
        .eq('paypal_order_id', intent.id)
        .maybeSingle()
      return { ok: true, duplicate: true, kind: 'purchase', itemSlug: md.item_slug, userPurchaseId: existing?.id }
    }
    if (insertErr) return { ok: false, status: 500, error: 'db_insert_failed', detail: insertErr.message }

    // Insertion live_messages pour déclencher l'overlay live + lecture TTS
    if (allowsMsg && purchaseRow?.id) {
      try {
        await maybeInsertLiveMessage(supabase, {
          itemSlug: md.item_slug,
          userPurchaseId: purchaseRow.id,
          userId,
          displayName: md.display_name || 'Anonyme',
          customMessage: md.message || null,
          amountCents: intent.amount,
          sessionId: md.session_id && md.session_id !== '' ? md.session_id : null,
          paymentIntentId: intent.id,
          cardBrand, cardLast4, receiptUrl, payerEmail,
          allowsCustomMessage: true,
        })
      } catch (err) {
        // L'achat est déjà enregistré, on log mais on ne fail pas (le user
        // a payé, on ne va pas renvoyer une erreur juste parce que le
        // message live n'a pas pu être inséré).
        console.error('[processIntent] live_message insert failed:', err)
      }
    }

    return { ok: true, kind: 'purchase', itemSlug: md.item_slug, userPurchaseId: purchaseRow?.id }
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

    if (event.type !== 'payment_intent.succeeded') {
      return json(200, { ok: true, ignored: event.type })
    }

    let intent = event.data?.object
    if (!intent?.id) return json(400, { error: 'no_intent_in_event' })

    // Re-fetch avec expand pour récupérer card_brand/last4/etc.
    try {
      intent = await stripeRequest(
        `/payment_intents/${encodeURIComponent(intent.id)}?expand[]=latest_charge`,
      )
    } catch {
      // Garde l'intent du webhook même sans latest_charge expanded
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const result = await processIntentSucceeded(intent, supabase)
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

  // Auth user (optionnel pour les achats anonymes de dédicace/sponsoring)
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
  // 1. CREATE-PURCHASE-INTENT
  //    Achat d'un produit shop_items (emote / dédicace / sponsoring).
  //    Prix lu en DB côté serveur (anti-tampering client).
  //
  //    Auth required uniquement si item.category === 'emote' (déblocage
  //    permanent attaché à un compte). Pour dédicaces et sponsoring,
  //    l'achat anonyme est autorisé.
  //
  //    `repeatable=false` ET déjà possédé → refuse l'achat.
  // ──────────────────────────────────────
  if (action === 'create-purchase-intent') {
    const { itemSlug, customMessage, displayName, sessionId, payerEmail } = body
    if (!itemSlug || typeof itemSlug !== 'string') {
      return json(400, { error: 'missing_item_slug' })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: item, error: itemErr } = await supabase
      .from('shop_items')
      .select('slug, name, price_cents, is_visible, category, allows_custom_message, repeatable')
      .eq('slug', itemSlug)
      .maybeSingle()
    if (itemErr || !item) return json(400, { error: 'item_not_found' })
    if (!item.is_visible) return json(400, { error: 'item_not_purchasable' })
    if (!item.price_cents || item.price_cents < 100) {
      return json(400, { error: 'invalid_item_price' })
    }

    // Auth required uniquement pour les emotes (déblocage permanent)
    if (item.category === 'emote' && !authUserId) {
      return json(401, { error: 'auth_required_for_emote' })
    }

    // Si l'item n'est pas repeatable et qu'un user connecté l'a déjà,
    // on refuse (l'UI front filtre déjà mais double-check serveur).
    if (!item.repeatable && authUserId) {
      const { data: existing } = await supabase
        .from('user_purchases')
        .select('id')
        .eq('user_id', authUserId)
        .eq('item_slug', itemSlug)
        .maybeSingle()
      if (existing) return json(400, { error: 'already_owned' })
    }

    // Validation displayName (obligatoire si achat anonyme OU si l'item
    // accepte un message custom — le bot TTS doit pouvoir dire un pseudo).
    let cleanDisplayName: string | null = null
    if (displayName && typeof displayName === 'string') {
      const trimmed = displayName.trim()
      if (trimmed.length === 0 || trimmed.length > 80) {
        return json(400, { error: 'invalid_display_name' })
      }
      cleanDisplayName = trimmed
    }
    // Pour les services live (allows_custom_message), pseudo obligatoire
    // — soit du compte connecté (récupéré en DB), soit fourni par le front.
    if (item.allows_custom_message && !cleanDisplayName && !authUserId) {
      return json(400, { error: 'display_name_required' })
    }

    // Anti-impersonation : si l'acheteur anonyme tape un pseudo déjà pris
    // par un membre, on refuse (sauf si c'est l'user connecté lui-même).
    if (cleanDisplayName) {
      const { data: clash } = await supabase
        .from('profiles')
        .select('id, display_name')
        .ilike('display_name', cleanDisplayName)
        .limit(1)
        .maybeSingle()
      if (clash && clash.id !== authUserId) {
        return json(400, {
          error: 'pseudo_taken',
          message: `Le pseudo "${cleanDisplayName}" est déjà utilisé par un membre.`,
        })
      }
    }

    // Validation customMessage : seulement si allows_custom_message
    let cleanMessage: string | null = null
    if (customMessage && typeof customMessage === 'string') {
      if (!item.allows_custom_message) {
        // L'item ne supporte pas les messages → on ignore silencieusement
        cleanMessage = null
      } else {
        const trimmed = customMessage.trim()
        if (trimmed.length > 300) return json(400, { error: 'message_too_long' })
        cleanMessage = trimmed || null
      }
    }

    // Email payeur (optionnel)
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
        amount: item.price_cents, // prix SERVEUR
        currency: 'eur',
        automatic_payment_methods: { enabled: true },
        description: `${item.name} — Mob Y Dick`,
        metadata: {
          kind: 'purchase',
          user_id: authUserId || '',
          item_slug: item.slug,
          display_name: cleanDisplayName || '',
          message: cleanMessage || '',
          session_id: sessionId || '',
        },
      }
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
  // 2. FINALIZE-PURCHASE
  //    Vérifie le PaymentIntent côté Stripe puis insère dans user_purchases
  //    + éventuellement live_messages (si allows_custom_message). Idempotent.
  // ──────────────────────────────────────
  if (action === 'finalize-purchase') {
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

    const md = intent.metadata || {}
    if (md.kind !== 'purchase') {
      return json(400, { error: 'wrong_intent_kind' })
    }
    // Pour les emotes (auth required), vérifie que l'user qui finalize est
    // bien celui qui a créé le PI (anti-vol d'item).
    if (md.user_id && md.user_id !== '' && md.user_id !== authUserId) {
      return json(403, { error: 'user_mismatch' })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const result = await processIntentSucceeded(intent, supabase)
    if (!result.ok) {
      return json(result.status || 500, { error: result.error, detail: result.detail })
    }
    return json(200, {
      ok: true,
      duplicate: !!result.duplicate,
      itemSlug: result.itemSlug,
      userPurchaseId: result.userPurchaseId,
      amountCents: intent.amount,
    })
  }

  // ──────────────────────────────────────
  // 3. CREATE-ORDER-INTENT (boutique merch physique — inchangé)
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
  // 4. FINALIZE-ORDER (inchangé)
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

    const md = intent.metadata || {}
    if (md.kind !== 'order') return json(400, { error: 'wrong_intent_kind' })
    if (md.user_id !== authUserId) return json(403, { error: 'user_mismatch' })

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const result = await processIntentSucceeded(intent, supabase)
    if (!result.ok) {
      return json(result.status || 500, { error: result.error, detail: result.detail })
    }
    return json(200, { ok: true, duplicate: !!result.duplicate })
  }

  // ──────────────────────────────────────
  // 5. ADMIN-SIMULATE-PURCHASE
  //    Joue l'animation d'achat sur le live sans débit ni DB write
  //    (l'admin veut tester l'overlay). Broadcast via realtime, jamais
  //    falsifiable côté client puisque cette action exige role='admin'
  //    re-vérifié serveur-side.
  // ──────────────────────────────────────
  if (action === 'admin-simulate-purchase' || action === 'admin-simulate-donation' /* legacy compat */) {
    if (!authUserId) return json(401, { error: 'auth_required' })

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', authUserId).maybeSingle()
    if (profile?.role !== 'admin') {
      return json(403, { error: 'admin_required' })
    }

    const { displayName, amountCents, message, sessionId, itemSlug } = body
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
            // Le front s'abonne sur 'purchase-simu' ET garde 'donation-simu'
            // pour rétro-compat le temps du déploiement.
            event: 'purchase-simu',
            payload: {
              id: `simu-${Date.now()}-${authUserId.slice(0, 8)}`,
              display_name: displayName.slice(0, 80),
              amount_cents: amt,
              message: message ? String(message).slice(0, 300) : null,
              item_slug: itemSlug || null,
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

  // Legacy actions removed (Stripe compliance v26) :
  //   - create-intent → use create-purchase-intent with itemSlug
  //   - finalize      → use finalize-purchase
  if (action === 'create-intent' || action === 'finalize') {
    return json(410, {
      error: 'action_removed',
      message: 'Les dons à montant libre ont été retirés. Utilise create-purchase-intent avec un itemSlug de shop_items.',
    })
  }

  return json(400, { error: 'unknown_action' })
})
