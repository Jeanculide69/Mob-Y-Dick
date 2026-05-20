import { useEffect, useRef, useState } from 'react';

const PAYPAL_CLIENT_ID = 'AT6gLyOB9yKCzgAXR2b_TwJH_b_DosUBPGJ-F2ZBp5oNsA1AoblVnki_ZuJ7a7h9STNzLqMoFyI9MC8A';

export default function PayPalButton({ amount, onSuccess, style = {}, type = 'checkout' }) {
  const containerRef = useRef(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let script = document.getElementById('paypal-sdk-script');
    
    const renderButtons = () => {
      if (!window.paypal) {
        setIsLoading(false);
        setError("Le SDK PayPal n'est pas chargé.");
        return;
      }
      
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }

      window.paypal.Buttons({
        style: {
          layout: 'vertical',
          color: 'gold',
          shape: 'rect',
          label: type === 'donation' ? 'donate' : 'checkout',
          height: 40,
          ...style
        },
        createOrder: (data, actions) => {
          return actions.order.create({
            purchase_units: [{
              amount: {
                currency_code: 'EUR',
                value: parseFloat(amount).toFixed(2)
              }
            }]
          });
        },
        onApprove: async (data, actions) => {
          setIsLoading(true);
          try {
            const details = await actions.order.capture();
            setIsLoading(false);
            if (onSuccess) {
              onSuccess(details, data.orderID);
            }
          } catch (err) {
            console.error('Capture Error:', err);
            setError("Paiement validé par PayPal mais impossible de finaliser l'enregistrement.");
            setIsLoading(false);
          }
        },
        onError: (err) => {
          console.error('PayPal Error:', err);
          setError('Erreur lors du paiement PayPal.');
          setIsLoading(false);
        }
      }).render(containerRef.current);
      
      setIsLoading(false);
    };

    if (!script) {
      script = document.createElement('script');
      script.id = 'paypal-sdk-script';
      script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&currency=EUR`;
      script.type = 'text/javascript';
      script.async = true;
      script.onload = renderButtons;
      script.onerror = () => {
        setError('Impossible de charger le script de paiement PayPal.');
        setIsLoading(false);
      };
      document.body.appendChild(script);
    } else {
      if (window.paypal) {
        renderButtons();
      } else {
        script.addEventListener('load', renderButtons);
      }
    }

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [amount, type, JSON.stringify(style)]);

  return (
    <div style={{ width: '100%', minHeight: '40px', position: 'relative' }}>
      {isLoading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 0', gap: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          <span style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          Chargement de PayPal...
        </div>
      )}
      {error && (
        <div style={{ color: '#ff4444', background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.2)', padding: '10px', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '10px', textAlign: 'center' }}>
          {error}
        </div>
      )}
      <div ref={containerRef} style={{ display: isLoading ? 'none' : 'block' }} />
    </div>
  );
}
