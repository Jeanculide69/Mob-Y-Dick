/**
 * stripe-donation — Supabase Edge Function
 *
 * Crée et finalise un don via Stripe Payment Intents.
 *
 * Deux actions :
 *   - action: 'create-intent' → crée un PaymentIntent côté Stripe et
 *     retourne le client_secret au front, qui confirme la carte via
 *     stripe.confirmCardPayment().
 *   - action: 'finalize' → re-vérifie le PaymentIntent côté serveur
 *     (status='succeeded' + montant cohérent) et insère le don dans la
 *     table donations via service_role (bypass RLS).
 *
 * ─── Secrets requis (Supabase Dashboard → Settings → Edge Functions) ───
 *   STRIPE_SECRET_KEY     = sk_test_xxx (test) ou sk_live_xxx (prod)
 *
 * ─── Setup côté front ───
 *   VITE_STRIPE_PUBLISHABLE_KEY = pk_test_xxx (test) ou pk_live_xxx (prod)
 *   (à mettre dans les env vars Vercel)
 *
 * ─── Deploy ───
 *   supabase functions deploy stripe-donation --no-verify-jwt
 *   (no-verify-jwt car les dons peuvent être anonymes)
 */
// @ts-nocheck — environnement Deno Edge Function
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!

const STRIPE_API = 'https://api.stripe.com/v1'

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

  return json(400, { error: 'unknown_action' })
})
