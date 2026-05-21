/**
 * StripeDonationForm — Formulaire de don intégré (Stripe Elements)
 *
 * Carte saisie directement sur le site (pas de redirection). Plus moderne
 * que PayPal popup, conversion meilleure, alerte live qui se déclenche
 * automatiquement après succès.
 *
 * Flow :
 *   1. User remplit pseudo / message / montant
 *   2. Submit → on appelle Edge Function `create-payment-intent` qui crée
 *      un PaymentIntent côté Stripe et retourne le client_secret
 *   3. Front confirme le paiement avec Stripe via stripe.confirmCardPayment
 *   4. Sur succès, on appelle Edge Function `finalize-stripe-donation`
 *      qui re-vérifie le PaymentIntent côté serveur (status='succeeded')
 *      et insère dans la table donations
 *
 * Setup requis :
 *   - VITE_STRIPE_PUBLISHABLE_KEY dans les env vars Vercel
 *   - STRIPE_SECRET_KEY dans Supabase Edge Function Secrets
 *   - Edge Function `stripe-donation` déployée (cf. supabase/functions/)
 */
import { useState, useMemo, useEffect } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import { supabase } from '../supabaseClient'
import { useToast } from './Toast'
import './StripeDonationForm.css'

const PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || ''

// stripePromise est singleton — loadStripe ne doit être appelé qu'une fois
// par session pour éviter les doubles chargements du SDK.
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
    invalid: {
      color: '#ff5555',
      iconColor: '#ff5555',
    },
  },
  hidePostalCode: true, // Pas dispo en France par défaut, on ne demande pas
}

/**
 * Formulaire wrapped dans Elements. Le composant interne accède aux hooks
 * Stripe via useStripe() / useElements() (impossibles hors d'Elements).
 */
function DonationFormInner({ amount, pseudo, message, sessionId, onSuccess, onCancel }) {
  const stripe = useStripe()
  const elements = useElements()
  const toast = useToast()
  const [processing, setProcessing] = useState(false)
  const [cardError, setCardError] = useState(null)
  const [cardComplete, setCardComplete] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!stripe || !elements) return
    if (!cardComplete) {
      setCardError('Renseigne tes infos de carte complètes')
      return
    }
    if (!pseudo?.trim()) {
      setCardError('Renseigne un pseudo pour ton don')
      return
    }
    if (!amount || amount < 1) {
      setCardError('Montant minimum : 1€')
      return
    }

    setProcessing(true)
    setCardError(null)

    try {
      // ── 1. Créer le PaymentIntent côté serveur ──
      const { data: intentData, error: intentErr } = await supabase.functions.invoke(
        'stripe-donation',
        {
          body: {
            action: 'create-intent',
            amountCents: Math.round(amount * 100),
            displayName: pseudo.slice(0, 80),
            message: (message || '').slice(0, 300),
            sessionId: sessionId || null,
          },
        }
      )
      if (intentErr) throw new Error(intentErr.message || 'Erreur création paiement')
      if (!intentData?.clientSecret) throw new Error('Pas de client_secret reçu')

      // ── 2. Confirmer le paiement avec Stripe (carte saisie côté navigateur) ──
      const cardElement = elements.getElement(CardElement)
      const result = await stripe.confirmCardPayment(intentData.clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: { name: pseudo.slice(0, 80) },
        },
      })

      if (result.error) {
        // Carte refusée, fonds insuffisants, etc.
        throw new Error(result.error.message || 'Paiement refusé')
      }
      if (result.paymentIntent?.status !== 'succeeded') {
        throw new Error(`Statut paiement inattendu : ${result.paymentIntent?.status}`)
      }

      // ── 3. Confirmer côté serveur (re-vérifie auprès de Stripe + insert DB) ──
      const { data: finalData, error: finalErr } = await supabase.functions.invoke(
        'stripe-donation',
        {
          body: {
            action: 'finalize',
            paymentIntentId: result.paymentIntent.id,
          },
        }
      )
      if (finalErr) throw new Error(finalErr.message || 'Erreur finalisation')
      if (!finalData?.ok) throw new Error(finalData?.error || 'Validation refusée')

      // 🎉
      toast.success(`Merci pour ton don de ${amount}€ ! Ton message s'affiche en direct.`)
      onSuccess?.()
    } catch (err) {
      setCardError(err.message || String(err))
      toast.error('Erreur don : ' + (err.message || err))
    } finally {
      setProcessing(false)
    }
  }

  return (
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

      {cardError && (
        <div className="stripe-form-error" role="alert">{cardError}</div>
      )}

      <div className="stripe-form-actions">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onCancel}
          disabled={processing}
        >
          Annuler
        </button>
        <button
          type="submit"
          className="btn btn-primary stripe-form-submit"
          disabled={!stripe || processing || !cardComplete}
        >
          {processing ? '⏳ Paiement en cours…' : `💳 Donner ${amount}€`}
        </button>
      </div>

      <p className="stripe-form-disclaimer">
        Paiement sécurisé par <strong>Stripe</strong>. Tes infos de carte ne
        transitent jamais par nos serveurs.
      </p>
    </form>
  )
}

/**
 * Composant exporté — wrap le formulaire dans <Elements>.
 * Si la publishable key n'est pas configurée, affiche un message d'erreur
 * propre au lieu de planter.
 */
export default function StripeDonationForm(props) {
  const [keyMissing] = useState(!PUBLISHABLE_KEY)

  // Stripe Elements options
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
      console.warn(
        '[Stripe] VITE_STRIPE_PUBLISHABLE_KEY non définie. Le formulaire de don ne s\'affichera pas.'
      )
    }
  }, [keyMissing])

  if (keyMissing) {
    return (
      <div className="stripe-form-missing">
        ⚠️ Paiement temporairement indisponible. Configuration Stripe manquante.
      </div>
    )
  }

  return (
    <Elements stripe={stripePromise} options={options}>
      <DonationFormInner {...props} />
    </Elements>
  )
}
