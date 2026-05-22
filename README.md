# 🏁 Mob Y Dick - Site Officiel

Bienvenue sur le dépôt du site officiel de **Mob Y Dick**, la plateforme dédiée aux événements de Mobcross !
Ce site offre une expérience interactive complète pour les fans, les riders et les organisateurs.

## ✨ Fonctionnalités Principales

- **📺 Live Streaming Intégré** : Diffusion en direct des courses et événements grâce à l'intégration d'**Agora RTC**.
- **💬 Interactions en Direct** : Système d'achat de sponsoring et d'emotes premium qui déclenchent instantanément des animations sur le live (confettis, messages personnalisés vocaux via TTS).
- **🛒 Boutique Officielle** : Vente de produits dérivés (merch) et gestion des commandes physiques avec paiements sécurisés via **Stripe**.
- **🏍️ Profils des Riders** : Pages dédiées aux pilotes et aux teams avec gestion d'avatars, biographies, et galeries de photos.
- **🛡️ Espace Administrateur** : Tableau de bord complet sécurisé pour gérer les sessions live, modérer les affiliations, gérer les commandes et simuler les interactions sur le stream.

## 🛠️ Stack Technique

- **Frontend** : React 19, Vite, Vanilla CSS
- **Backend as a Service** : [Supabase](https://supabase.com/)
  - Base de données PostgreSQL (avec Row Level Security stricte)
  - Authentification
  - Realtime (abonnements temps réel pour synchroniser le live et les animations)
  - Edge Functions (ex: validation et création des intentions de paiement Stripe)
- **Paiements** : Stripe (Payment Intents & Webhooks serveurs)
- **Live Vidéo** : Agora Web SDK
- **Monitoring & Perf** : Sentry pour la capture d'erreurs, Vercel Analytics

## 🚀 Installation & Développement local

1. **Installer les dépendances** :
   ```bash
   npm install
   ```

2. **Configuration de l'environnement** :
   Copiez le fichier d'exemple et remplissez vos clés.
   ```bash
   cp .env.example .env
   ```
   *Note : Le fichier `.env` est ignoré par Git pour prévenir la fuite de secrets.*

3. **Lancer le serveur de développement** :
   ```bash
   npm run dev
   ```

## 🔒 Architecture de Sécurité

- Les montants des transactions et produits sont validés côté serveur pour empêcher la modification de prix par le client.
- L'écoute des événements Stripe se fait via un webhook de paiement, garantissant qu'aucun achat n'est validé dans la base sans paiement effectif.
- Les seules variables d'environnement exposées au client (`VITE_...`) sont des clés publiques prévues à cet effet (Clé publique Supabase & Agora). Les clés secrètes (`STRIPE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) sont stockées exclusivement de façon chiffrée sur les serveurs Edge.

---
*Fait avec passion pour la communauté Mobcross 🏍️🏁*
