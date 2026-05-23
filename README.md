# 🏁 Mob Y Dick - Site Officiel

Bienvenue sur le dépôt du site officiel de **Mob Y Dick**, la plateforme dédiée aux événements de Mobcross !
Ce site offre une expérience interactive complète pour les fans, les riders et les organisateurs.

## ✨ Fonctionnalités Principales

- **📺 Live Streaming Intégré** : Diffusion en direct des courses et événements grâce à l'intégration d'**Agora RTC**.
- **🏁 Course en Direct** : Page live avec classement temps réel, podiums par catégorie, chronométrage organisateur, drapeau à damier pré-course / fin de course, et bouton "Annuler le lancement" pour repasser une session live en configuration en un clic.
- **💬 Chat Global + Chat Team** : Onglets dans le chat live pour basculer entre la conversation publique et le chat privé de sa team (cf. système Teams).
- **🫂 Système Teams (privées, gratuites)** : Chaque user peut créer ou rejoindre une team via code d'invitation 6 caractères. Chat dédié et annonces vocales (TTS) lues uniquement chez les membres — sans fuite cross-team grâce au RLS Supabase strict. Limité à 1 team par user.
- **📣 Annonces Live** : Annonces organisateur (voix masculine grave) et annonces team (voix féminine, message lu uniquement pour les membres) avec bannière flottante + historique encadré dans le chat.
- **🎉 Interactions en Direct** : Système d'achat de sponsoring et d'emotes premium qui déclenchent instantanément des animations sur le live (confettis, messages personnalisés vocaux via TTS).
- **🛒 Boutique Officielle** : Vente de produits dérivés (merch) et gestion des commandes physiques avec paiements sécurisés via **Stripe**. 100% prix fixes, conformité Stripe.
- **🏍️ Profils des Riders** : Pages dédiées aux pilotes et aux teams avec gestion d'avatars, biographies, et galeries de photos.
- **🛡️ Cockpit Administrateur** : Tableau de bord complet sécurisé pour gérer les sessions live, modérer les affiliations, gérer les commandes, administrer les teams privées (CRUD teams + membres) et simuler les interactions sur le stream.

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

4. **Appliquer les migrations Supabase** :
   Les migrations se trouvent dans `supabase/migrations/database_v*.sql`. Elles sont versionnées et idempotentes — applique-les dans l'ordre (v2, v3, …, v36) via le SQL Editor de Supabase ou la CLI. La dernière en date est `v36_teams_admin.sql`.

## 🔒 Architecture de Sécurité

- **RLS strict** sur toutes les tables sensibles (teams, team_members, team_chat_messages, team_announcements, orders, donations, …). Aucune table ouverte en lecture/écriture sans policy.
- **Isolation cross-team** : helper `is_team_member()` en SECURITY DEFINER pour éviter la récursion RLS, inscriptions uniquement via RPCs (`create_team`, `join_team`, `leave_team`) avec checks pré-emptifs — pas de policy INSERT directe sur `team_members`. Le Realtime postgres_changes respecte le RLS sur SELECT donc les events ne sont diffusés qu'aux membres légitimes.
- **Admin via RPCs dédiées** : les fonctions `admin_*` (V36) vérifient `is_user_admin()` en début et utilisent SECURITY DEFINER plutôt que d'élargir le RLS aux admins — pas d'effet de bord sur les policies des utilisateurs normaux.
- Les montants des transactions et produits sont validés côté serveur pour empêcher la modification de prix par le client.
- L'écoute des événements Stripe se fait via un webhook de paiement, garantissant qu'aucun achat n'est validé dans la base sans paiement effectif.
- Les seules variables d'environnement exposées au client (`VITE_...`) sont des clés publiques prévues à cet effet (Clé publique Supabase & Agora). Les clés secrètes (`STRIPE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) sont stockées exclusivement de façon chiffrée sur les serveurs Edge.

---
*Fait avec passion pour la communauté Mobcross 🏍️🏁*
