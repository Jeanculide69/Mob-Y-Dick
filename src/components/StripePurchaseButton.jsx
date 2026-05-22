/**
 * StripePurchaseButton — Bouton + modal pour acheter un produit shop_items
 *
 * Affiche un bouton "Acheter Xe" sur une carte produit (emote / dédicace /
 * sponsoring). Au clic, ouvre une modal avec :
 *  - Récap : nom + emoji + prix
 *  - Si item.allows_custom_message :
 *      • champ pseudo (auto-rempli depuis le profil si connecté, sinon saisie)
 *      • textarea message custom (lu à l'antenne par le bot TTS)
 *  - <CardElement> Stripe pour saisir la carte
 *  - Bouton de confirmation qui :
 *     1. Appelle l'Edge Function `stripe-donation` action='create-purchase-intent'
 *        (passe customMessage / displayName / sessionId si pertinent)
 *     2. Confirme le paiement via stripe.confirmCardPayment
 *     3. Appelle action='finalize-purchase' → insert user_purchases +
 *        éventuellement live_messages côté serveur
 *
 * Achats anonymes : si item.category ≠ 'emote', un visiteur non connecté
 * peut acheter (l'achat n'est pas attaché à un compte permanent — c'est
 * un service unique, pas un déblocage).
 */
import { useState, useMemo, useEffect } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'
import { useToast } from './Toast'
import './StripeCheckout.css'

const PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || ''
const stripePromise = PUBLISHABLE_KEY ? loadStripe(PUBLISHABLE_KEY) : null

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: '"Inter", system-ui, sans-serif',
      '::placeholder': { color: 'rgba(255,255,255,0.4)' },
      iconColor: '#ff5500',
    },
    invalid: { color: '#ff5555', iconColor: '#ff5555' },
  },
  hidePostalCode: true,
}

function PurchaseModalInner({ item, sessionId, authUser, authUserDisplayName, onClose, onSuccess }) {
  const stripe = useStripe()
  const elements = useElements()
  const toast = useToast()
  const [processing, setProcessing] = useState(false)
  const [cardError, setCardError] = useState(null)
  const [cardComplete, setCardComplete] = useState(false)

  // Pseudo affiché à l'antenne. Si user connecté, on prend son display_name
  // (read-only) ; sinon, on laisse saisir (max 80 chars).
  const hasAuthName = !!authUserDisplayName
  const [pseudo, setPseudo] = useState(authUserDisplayName || '')
  // Message custom lu par le bot TTS (uniquement si allows_custom_message).
  const [customMessage, setCustomMessage] = useState('')
  // Email payeur (pour le reçu) — optionnel si pas connecté.
  const [payerEmail, setPayerEmail] = useState('')
  const authEmail = authUser?.email || null

  const priceEuros = (item.price_cents / 100).toFixed(2)
  const allowsMessage = !!item.allows_custom_message
  const requiresAuth = item.category === 'emote'

  // Si l'item est une emote et que le user n'est pas connecté, on bloque
  // dès l'affichage (le bouton parent filtre déjà ce cas mais double-check).
  useEffect(() => {
    if (requiresAuth && !authUser) {
      toast.error('Connecte-toi pour acheter cette emote.')
      onClose()
    }
  }, [requiresAuth, authUser, toast, onClose])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!stripe || !elements || !cardComplete) return

    if (allowsMessage && !pseudo.trim()) {
      setCardError('Renseigne un pseudo pour ton achat')
      return
    }
    if (pseudo.length > 80) {
      setCardError('Pseudo trop long (80 caractères max)')
      return
    }
    if (customMessage.length > 300) {
      setCardError('Message trop long (300 caractères max)')
      return
    }

    setProcessing(true)
    setCardError(null)

    try {
      // 1. Créer le purchase intent (prix vérifié serveur-side)
      const { data: intentData, error: intentErr } = await supabase.functions.invoke(
        'stripe-donation',
        {
          body: {
            action: 'create-purchase-intent',
            itemSlug: item.slug,
            displayName: pseudo.trim() || null,
            customMessage: allowsMessage ? (customMessage.trim() || null) : null,
            sessionId: sessionId || null,
            payerEmail: authEmail || payerEmail.trim() || null,
          },
        }
      )
      if (intentErr) throw new Error(intentErr.message || 'Erreur création paiement')
      if (!intentData?.clientSecret) {
        if (intentData?.error === 'already_owned') {
          toast.info(`Tu possèdes déjà ${item.name}.`)
          onSuccess?.()
          return
        }
        if (intentData?.error === 'pseudo_taken') {
          throw new Error(intentData.message || 'Pseudo déjà pris par un membre.')
        }
        throw new Error(intentData?.error || 'Pas de client_secret reçu')
      }

      // 2. Confirmer la carte avec Stripe
      const cardElement = elements.getElement(CardElement)
      const result = await stripe.confirmCardPayment(intentData.clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: pseudo.trim() ? { name: pseudo.trim().slice(0, 80) } : undefined,
        },
      })
      if (result.error) throw new Error(result.error.message || 'Paiement refusé')
      if (result.paymentIntent?.status !== 'succeeded') {
        throw new Error(`Statut paiement inattendu : ${result.paymentIntent?.status}`)
      }

      // 3. Finaliser côté serveur
      const { data: finalData, error: finalErr } = await supabase.functions.invoke(
        'stripe-donation',
        {
          body: {
            action: 'finalize-purchase',
            paymentIntentId: result.paymentIntent.id,
          },
        }
      )
      if (finalErr) throw new Error(finalErr.message || 'Erreur finalisation')
      if (!finalData?.ok) throw new Error(finalData?.error || 'Validation refusée')

      console.info('[Stripe finalize] ok', {
        paymentIntentId: result.paymentIntent.id,
        itemSlug: item.slug,
        duplicate: !!finalData.duplicate,
      })

      const successMsg = allowsMessage
        ? `Merci pour ton achat (${item.name}) ! Ton message s'affiche en direct.`
        : `Débloqué : ${item.name} ! Utilise-la depuis le live.`
      toast.success(successMsg)
      onSuccess?.()
    } catch (err) {
      setCardError(err.message || String(err))
      toast.error('Erreur achat : ' + (err.message || err))
    } finally {
      setProcessing(false)
    }
  }

  return createPortal(
    <div
      className="stripe-purchase-overlay"
      onClick={(e) => { if (e.target === e.currentTarget && !processing) onClose() }}
    >
      <div className="stripe-purchase-modal glass">
        <div className="stripe-purchase-header">
          <h3>{item.emoji || '🛒'} {item.name}</h3>
          <button
            type="button"
            className="stripe-purchase-close"
            onClick={onClose}
            disabled={processing}
            aria-label="Fermer"
          >✕</button>
        </div>

        <p className="stripe-purchase-desc">{item.description}</p>

        <div className="stripe-purchase-price-line">
          <span>Prix</span>
          <strong className="stripe-purchase-price-amount">{priceEuros}€</strong>
        </div>

        <form className="stripe-form" onSubmit={handleSubmit}>
          {/* Pseudo + message custom : uniquement pour les services live */}
          {allowsMessage && (
            <>
              <label className="stripe-form-label">
                Pseudo (affiché à l'écran)
                {hasAuthName ? (
                  <div className="stripe-form-authuser">
                    <span className="stripe-form-authuser-icon">✓</span>
                    <span>Membre <strong>{authUserDisplayName}</strong></span>
                  </div>
                ) : (
                  <input
                    type="text"
                    placeholder="Ex: Rider44"
                    value={pseudo}
                    onChange={(e) => setPseudo(e.target.value)}
                    disabled={processing}
                    maxLength={80}
                    className="stripe-email-input"
                  />
                )}
              </label>

              <label className="stripe-form-label">
                Message <span style={{ fontWeight: 400, fontSize: '0.78rem', color: 'var(--text-muted)' }}>(lu à l'antenne, 300 caractères max)</span>
                <textarea
                  placeholder="Allez Mob Y Dick, on est avec vous !"
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  disabled={processing}
                  maxLength={300}
                  rows={3}
                  className="stripe-email-input"
                  style={{ resize: 'vertical', fontFamily: 'inherit' }}
                />
              </label>
            </>
          )}

          {/* Email reçu : seulement si pas connecté */}
          {!authEmail && (
            <label className="stripe-form-label">
              Email <span style={{ fontWeight: 400, fontSize: '0.78rem', color: 'var(--text-muted)' }}>(optionnel — pour recevoir un reçu)</span>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="ton@email.com"
                value={payerEmail}
                onChange={(e) => setPayerEmail(e.target.value)}
                disabled={processing}
                maxLength={254}
                className="stripe-email-input"
              />
            </label>
          )}

          <label className="stripe-form-label">
            Informations de carte
            <div className="stripe-card-wrap">
              <CardElement
                options={CARD_ELEMENT_OPTIONS}
                onChange={(e) => {
                  setCardComplete(e.complete)
                  setCardError(e.error?.message || null)
                }}
              />
            </div>
          </label>

          {cardError && <div className="stripe-form-error" role="alert">{cardError}</div>}

          <div className="stripe-form-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={processing}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="btn btn-primary stripe-form-submit"
              disabled={!stripe || processing || !cardComplete}
            >
              {processing ? '⏳ Paiement…' : `💳 Acheter pour ${priceEuros}€`}
            </button>
          </div>

          <p className="stripe-form-disclaimer">
            Paiement sécurisé par <strong>Stripe</strong>. Achat ferme et définitif,
            sans remboursement ultérieur (service immédiat).
          </p>
        </form>
      </div>
    </div>,
    document.body
  )
}

export default function StripePurchaseButton({ item, sessionId, authUser, authUserDisplayName, onPurchased }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [keyMissing] = useState(!PUBLISHABLE_KEY)

  const options = useMemo(() => ({
    appearance: {
      theme: 'night',
      variables: {
        colorPrimary: '#ff5500',
        colorBackground: '#0a0a0a',
        colorText: '#ffffff',
      },
    },
  }), [])

  useEffect(() => {
    if (keyMissing) {
      console.warn('[Stripe] VITE_STRIPE_PUBLISHABLE_KEY manquante — le bouton achat est désactivé.')
    }
  }, [keyMissing])

  if (keyMissing) {
    return (
      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        Paiement indispo
      </span>
    )
  }

  const priceEuros = (item.price_cents / 100).toFixed(2)

  return (
    <>
      <button
        type="button"
        className="btn btn-primary"
        style={{ width: '100%', minWidth: '120px', fontWeight: 700 }}
        onClick={() => setModalOpen(true)}
      >
        💳 {priceEuros}€
      </button>
      {modalOpen && (
        <Elements stripe={stripePromise} options={options}>
          <PurchaseModalInner
            item={item}
            sessionId={sessionId}
            authUser={authUser}
            authUserDisplayName={authUserDisplayName}
            onClose={() => setModalOpen(false)}
            onSuccess={() => {
              setModalOpen(false)
              onPurchased?.()
            }}
          />
        </Elements>
      )}
    </>
  )
}
