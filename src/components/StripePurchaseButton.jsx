/**
 * StripePurchaseButton — Bouton + modal pour acheter une emote premium
 *
 * Affiche un bouton "Acheter Xe" sur une emote premium. Au clic, ouvre
 * une mini-modal avec :
 *  - Le récap de l'achat (nom emote + prix)
 *  - Un <CardElement> Stripe pour saisir la carte
 *  - Bouton de confirmation qui :
 *     1. Appelle l'Edge Function `stripe-donation` action='create-purchase-intent'
 *     2. Confirme le paiement avec Stripe via stripe.confirmCardPayment
 *     3. Appelle l'Edge Function action='finalize-purchase' → débloque
 *        l'emote dans user_purchases côté serveur
 *
 * Sur succès, appelle onSuccess() → le parent recharge userPurchases →
 * le badge "Débloqué" apparaît à la place du bouton.
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
import './StripeDonationForm.css' // ← réutilise les styles du donation form

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

function PurchaseModalInner({ item, onClose, onSuccess }) {
  const stripe = useStripe()
  const elements = useElements()
  const toast = useToast()
  const [processing, setProcessing] = useState(false)
  const [cardError, setCardError] = useState(null)
  const [cardComplete, setCardComplete] = useState(false)

  const priceEuros = (item.price_cents / 100).toFixed(2)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!stripe || !elements || !cardComplete) return

    setProcessing(true)
    setCardError(null)

    try {
      // 1. Create purchase intent côté serveur (prix vérifié serveur-side)
      const { data: intentData, error: intentErr } = await supabase.functions.invoke(
        'stripe-donation',
        {
          body: {
            action: 'create-purchase-intent',
            itemSlug: item.slug,
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
        throw new Error(intentData?.error || 'Pas de client_secret reçu')
      }

      // 2. Confirmer carte avec Stripe
      const cardElement = elements.getElement(CardElement)
      const result = await stripe.confirmCardPayment(intentData.clientSecret, {
        payment_method: { card: cardElement },
      })
      if (result.error) throw new Error(result.error.message || 'Paiement refusé')
      if (result.paymentIntent?.status !== 'succeeded') {
        throw new Error(`Statut paiement inattendu : ${result.paymentIntent?.status}`)
      }

      // 3. Finaliser côté serveur → insert dans user_purchases
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

      toast.success(`Débloqué : ${item.name} ! Utilise-la depuis le live.`)
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
          <h3>{item.emoji || '🔊'} {item.name}</h3>
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
              {processing ? '⏳ Paiement…' : `💳 Débloquer pour ${priceEuros}€`}
            </button>
          </div>

          <p className="stripe-form-disclaimer">
            Paiement sécurisé par <strong>Stripe</strong>. L'emote sera
            disponible immédiatement après confirmation.
          </p>
        </form>
      </div>
    </div>,
    document.body
  )
}

export default function StripePurchaseButton({ item, onPurchased }) {
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

  return (
    <>
      <button
        type="button"
        className="btn btn-primary"
        style={{ width: '100%', minWidth: '120px', fontWeight: 700 }}
        onClick={() => setModalOpen(true)}
      >
        💳 {(item.price_cents / 100).toFixed(2)}€
      </button>
      {modalOpen && (
        <Elements stripe={stripePromise} options={options}>
          <PurchaseModalInner
            item={item}
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
