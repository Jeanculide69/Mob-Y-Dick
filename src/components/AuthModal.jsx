import { useState } from 'react';
import { supabase } from '../supabaseClient';
import './AuthModal.css';

export default function AuthModal({ isOpen, onClose }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
      if (error) throw error;
    } catch (err) {
      setError(err.message);
    }
  };

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        setMessage("Inscription réussie ! Vérifiez votre boîte mail pour confirmer votre compte.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        onClose();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-modal-overlay" onClick={onClose}>
      <div className="auth-modal glass fade-in" onClick={(e) => e.stopPropagation()}>
        <button className="auth-close" onClick={onClose}>×</button>
        
        <div className="auth-header">
          <h2>{isSignUp ? "Créer un compte" : "Connexion"}</h2>
          <p>Rejoignez la MobCross Team</p>
        </div>

        {error && <div className="auth-alert error">{error}</div>}
        {message && <div className="auth-alert success">{message}</div>}

        <button className="btn btn-google" onClick={handleGoogleLogin}>
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="google-icon" />
          Continuer avec Google
        </button>

        <div className="auth-divider">
          <span>ou</span>
        </div>

        <form onSubmit={handleEmailAuth} className="auth-form">
          <input
            type="email"
            placeholder="Adresse e-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="auth-input"
          />
          <input
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="auth-input"
          />
          <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
            {loading ? "Chargement..." : (isSignUp ? "S'inscrire" : "Se connecter")}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            {isSignUp ? "Vous avez déjà un compte ?" : "Pas encore de compte ?"}
            <button className="text-accent toggle-mode-btn" onClick={() => setIsSignUp(!isSignUp)}>
              {isSignUp ? "Connectez-vous" : "Inscrivez-vous"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
