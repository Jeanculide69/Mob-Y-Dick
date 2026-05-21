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

function OrderCheckoutInner({ product, checkoutData, onSuccess, onCancel }) {
  const stripe = useStripe()
  const elements = useElements()
  const toast = useToast()
  const [processing, setProcessing] = useState(false)
  const [cardError, setCardError] = useState(null)
  const [cardComplete, setCardComplete] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!stripe || !elements || !cardComplete) return

    setProcessing(true)
    setCardError(null)

    try {
      // 1. Create order intent
      const { data: intentData, error: intentErr } = await supabase.functions.invoke(
        'stripe-donation',
        {
          body: {
            action: 'create-order-intent',
            productId: product.id,
            customText: checkoutData.customText,
            size: checkoutData.size,
            customerName: checkoutData.customerName,
            customerEmail: checkoutData.customerEmail,
            shippingAddress: checkoutData.shippingAddress,
            shippingCity: checkoutData.shippingCity,
            shippingZip: checkoutData.shippingZip,
            shippingCountry: checkoutData.shippingCountry,
          },
        }
      )
      
      if (intentErr) throw new Error(intentErr.message || 'Erreur création paiement')
      if (!intentData?.clientSecret) throw new Error(intentData?.error || 'Erreur de communication avec Stripe')

      // 2. Confirmer carte
      const cardElement = elements.getElement(CardElement)
      const result = await stripe.confirmCardPayment(intentData.clientSecret, {
        payment_method: { 
          card: cardElement,
          billing_details: {
            name: checkoutData.customerName,
            email: checkoutData.customerEmail,
          }
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
            action: 'finalize-order',
            paymentIntentId: result.paymentIntent.id,
          },
        }
      )
      
      if (finalErr) throw new Error(finalErr.message || 'Erreur finalisation')
      if (!finalData?.ok) throw new Error(finalData?.error || 'Validation refusée')

      toast.success(`Commande validée pour ${product.name} !`)
      onSuccess?.()
    } catch (err) {
      setCardError(err.message || String(err))
      toast.error('Erreur commande : ' + (err.message || err))
    } finally {
      setProcessing(false)
    }
  }

  return (
    <form className="stripe-form" onSubmit={handleSubmit} style={{marginTop: '20px'}}>
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

      <div className="stripe-form-actions" style={{marginTop: '20px'}}>
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
          {processing ? '⏳ Paiement en cours…' : `💳 Payer ${product.price}`}
        </button>
      </div>

      <p className="stripe-form-disclaimer">
        Paiement sécurisé par <strong>Stripe</strong>. Vos informations bancaires ne transitent jamais par nos serveurs.
      </p>
    </form>
  )
}

export default function StripeOrderCheckout(props) {
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

  if (keyMissing) {
    return (
      <div className="stripe-form-missing">
        ⚠️ Paiement temporairement indisponible. Configuration Stripe manquante.
      </div>
    )
  }

  return (
    <Elements stripe={stripePromise} options={options}>
      <OrderCheckoutInner {...props} />
    </Elements>
  )
}
