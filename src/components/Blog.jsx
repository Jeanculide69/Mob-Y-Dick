import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'
import MotoCropper from './MotoCropper'
import './Blog.css'

// Initial content-rich articles written in French to satisfy Google AdSense
const STATIC_ARTICLES = [
  {
    id: 'static-1',
    title: "L'Épopée de la Team Mob Y Dick : De la passion à la boue",
    category: "histoire",
    content: `C'est dans un coin d'atelier encombré de vieilles pièces de Peugeot 103 et de Motobécane 51 qu'est née l'histoire de la team Mob Y Dick. À l'origine, une simple bande de copains d'enfance, partageant une fascination pour la mécanique vintage et la vitesse brute. Ce qui ne devait être qu'une blague un après-midi de printemps s'est rapidement transformé en une véritable passion pour le Mobcross, cette discipline unique qui voit s'affronter des cyclomoteurs modifiés sur des pistes de terre.

Le nom "Mob Y Dick" a été choisi en hommage aux célèbres machines bleues et au mythique monstre des mers, symbolisant notre quête pour dompter nos "monstres mécaniques" récalcitrants. Nos débuts ont été marqués par beaucoup de fumée, de rires et de pannes légendaires. Lors de notre première course, aucune meule n'a franchi la ligne d'arrivée, mais l'esprit de groupe était scellé.

Au fil des saisons, l'équipe s'est structurée. Nous avons adopté nos couleurs distinctives (rouge, orange et noir) et commencé à personnaliser nos motos avec des kits déco style graffiti uniques, peints à la main. Mais notre philosophie reste inchangée :

> "Chez nous, l'esprit d'équipe et la rigolade passent toujours avant la ligne d'arrivée. On rigole fort, on s'entraide au stand, et si une meule explose au bout de trois tours, c'est simplement l'excuse idéale pour ouvrir une bière et en discuter !"

Aujourd'hui, la team compte plus de 9 riders et une équipe mécanique dévouée, prête à en découdre sur toutes les pistes de France. La passion de la boue et du 2-temps coule définitivement dans nos veines !`,
    excerpt: "Découvrez comment une bande de copains d'enfance a transformé de vieux cyclomoteurs Peugeot en véritables bêtes de course sur terre.",
    image_url: "/motos/2cd0ab6d-2472-4496-aac8-af9a290fbf14.jpg",
    read_time: 6,
    author: "Fumax (Président)",
    created_at: "2026-05-20T10:00:00Z"
  },
  {
    id: 'static-2',
    title: "Préparation Moteur & Cycle : Comment monter une Mobcross de compétition",
    category: "mecanique",
    content: `Préparer un cyclomoteur de route Peugeot 103 pour lui faire subir les assauts du Mobcross est un art subtil qui demande rigueur, ingéniosité et patience. Notre chef mécanicien, Gauthier, nous livre ici les secrets de préparation de la célèbre "Beast R-1".

### 1. La préparation moteur (Le cœ​ur du 2-temps)
Pour obtenir une accélération nerveuse à bas régime – essentielle pour s'extirper des virages boueux – nous modifions profondément le moteur :
- **Les carters d'origine** sont méticuleusement alignés avec les transferts du cylindre. Nous utilisons des clapets Athena en carbone pour optimiser le flux de gaz frais.
- **Le cylindre :** Nous restons sur une cylindrée de 50cc réglementaire pour la catégorie mais nous augmentons légèrement les diagrammes d'échappement (autour de 178°) et d'admission (120°) à la fraiseuse.
- **La carburation :** Nous installons un carburateur Dell'Orto PHBG de 15 ou 17,5 mm, avec un réglage de gicleur principal peaufiné en fonction du climat. Un filtre à air en mousse type cornet de motocross protège le tout de la poussière.
- **L'échappement :** Un pot de détente Giannelli Black Gun ou Doppler ER1, raccourci pour décaler la puissance dans les mi-régimes.

### 2. Le châ​ssis et la partie cycle (Sécurité et rigidité)
Le cadre d'origine d'un Peugeot 103 n'est pas conçu pour faire des sauts. Sans modifications, il se plierait dès le premier saut.
- **Renfort de cadre :** Nous soudons une barre centrale en acier entre la colonne de direction et le tube de selle. Les carters et le bras oscillant reçoivent des plaques de renfort soudées au TIG.
- **Le bras oscillant :** Les bras oscillants d'origine ont tendance à vriller sous la tension de la chaîne. Nous installons un bras oscillant de Peugeot RCX renforcé ou fabriquons nos propres platines rigides.
- **Suspensions :** À l'avant, nous adaptons une fourche hydraulique renforcée provenant d'une mécaboite 50cc. À l'arrière, une paire d'amortisseurs réglables à gaz de 360 mm absorbe les chocs.
- **Pneumatiques :** Des pneus Michelin StarCross 5 ou Pirelli Scorpion MX montés sur des jantes à rayons renforcées de 17 pouces complètent la monte.

> "La préparation d'une mobcross est un équilibre permanent entre puissance brute et fiabilité. Une machine hyper performante qui serre au bout de deux tours ne vous fera jamais gagner de course."`,
    excerpt: "Carburation, diagrammes de cylindre, renforts de cadre au TIG... Plongez dans les détails techniques de nos préparations Mobcross.",
    image_url: "/motos/05c88f5e-250c-41fa-bdc4-dc97b785cd54.jpg",
    read_time: 8,
    author: "Gauthier (Chef Mécano)",
    created_at: "2026-05-22T14:30:00Z"
  },
  {
    id: 'static-3',
    title: "Le Grand Récit du Championnat de France de Mobcross 2025",
    category: "competition",
    content: `La saison 2025 du Championnat de France de Mobcross restera gravée dans l'histoire de la team Mob Y Dick comme l'une des plus éprouvantes, mais aussi l'une des plus mémorables. Retour sur les temps forts d'une année riche en adrénaline.

### Nozay : L'épreuve de la poussière
La première manche s'est déroulée sous un soleil de plomb et sur une piste sèche transformée en nuage de poussière géant. 
- **Manche 1 :** Très bon départ d'Alex sur la Beast R-1 qui se faufile en 3ème position. Malheureusement, après 4 tours, son embrayage commence à patiner sévèrement à cause de la surchauffe. Il finit difficilement à la 8ème place.
- **Manche 2 :** Après un changement d'embrayage express aux stands par Gauthier et StickMan, Alex repart gonflé à bloc et arrache la 5ème place après une bataille féroce dans le dernier tour.

### Saint-Vincent-des-Landes : L'enfer de la boue
Changement radical de décor pour la seconde épreuve : une pluie battante s'est abattue sur le circuit toute la nuit, transformant la piste en un bourbier sans nom. C'est ici que l'esprit de notre team a fait la différence.
Dans ces conditions extrêmes, les moteurs chauffent et aspirent de l'eau. Bob a connu une panne d'allumage dans la première manche. Gauthier a réussi à nettoyer et à étanchéifier le rotor sous la pluie battante en moins de 15 minutes. 
Grâce à un pilotage ultra-technique dans les ornières et à la fiabilité de nos filtres à air modifiés "anti-boue", Alex parvient à décrocher la 2ème place sur le podium de la journée !

### Bilan de la saison 2025
Grâce à une régularité exemplaire lors de la finale et à une solidarité sans faille au sein des stands (nous avons prêté un carburateur de rechange à une équipe concurrente en détresse), la team Mob Y Dick décroche une fantastique **3ème place au classement général par équipe du championnat** !

Un immense merci à nos sponsors locaux et à tous les supporters venus nous encourager au bord des pistes avec leurs fumigènes orange et rouge. Rendez-vous en 2026 pour viser le titre !`,
    excerpt: "Revivez les manches mémorables de la saison 2025, de la poussière étouffante de Nozay jusqu'au podium boueux de Saint-Vincent.",
    image_url: "/motos/5e66cf75-e1de-41d7-8273-ed89eb9c8e3e.jpg",
    read_time: 7,
    author: "Alex (Rider N°1)",
    created_at: "2026-05-24T18:15:00Z"
  },
  {
    id: 'static-4',
    title: "Guide du Débutant : Comment se lancer dans le Mobcross ?",
    category: "guide",
    content: `Vous entendez le vrombissement rageur d'un moteur 2-temps, vous voyez des bécanes voler au-dessus des bosses et vous vous dites : "C'est ça qu'il me faut !" ? Vous avez raison. Le Mobcross est sans doute le sport mécanique le plus convivial, le plus fun et le plus accessible financièrement. Voici notre guide complet pour débuter dans les meilleures conditions.

### 1. Choisir sa base (Le choix de la meule)
Pour débuter, deux choix s'imposent en France :
- **Le Peugeot 103 (MVL, RCX, SPX) :** C'est la base la plus populaire. Les pièces de rechange sont abondantes, peu chères, et la mécanique est extrêmement simple à comprendre.
- **La Motobécane 51 (Club, Hard Rock, Magnum) :** Également très populaire, réputée pour son moteur AV10 très performant d'origine.

Pour vos premiers tours de roues, évitez les cadres trop modifiés. Trouvez une base saine d'origine, démontez-la entièrement pour nettoyer le réservoir, et commencez par y greffer une barre de renfort centrale soudée.

### 2. L'équipement de sécurité (Priorité absolue)
Même si l'on roule sur un cyclo de 50cc, les chutes font mal et la sécurité ne doit jamais être négligée. L'équipement obligatoire comprend :
- Un casque de motocross homologué.
- Des lunettes de protection (masque) anti-poussière.
- Une dorsale et un pare-pierres homologués FFM.
- Des bottes de motocross rigides (les baskets sont strictement interdites sur circuit).
- Des gants renforcés et une tenue en tissu résistant (pantalon et maillot de cross).

### 3. La licence et les clubs
Pour rouler en toute légalité et être couvert par les assurances, vous devez adhérer à un club affilié à la Fédération Française de Motocyclisme (FFM) ou à l'UFOLEP. Vous passerez un examen médical d'aptitude et obtiendrez votre licence annuelle de compétition ou d'entraînement.

### 4. Le budget estimé pour débuter
L'un des grands points forts du Mobcross est son coût dérisoire comparé au Motocross moderne :
- **Achat du cyclo d'occasion :** 300 € à 600 €
- **Pièces de préparation de base & pneus cross :** 250 €
- **Équipement de protection complet :** 300 €
- **Licence annuelle :** 150 €
- **Budget total estimé :** Environ 1000 € à 1300 € pour une première saison complète !

N'hésitez pas à venir nous voir lors des entraînements de la team Mob Y Dick ou à nous envoyer un message via notre formulaire de contact, nous serons ravis de vous conseiller pour votre premier montage !`,
    excerpt: "Vous rêvez de tâter de la terre en 50cc ? Voici les conseils de la team pour choisir sa mobylette, s'équiper et obtenir sa licence.",
    image_url: "/motos/6c3be747-ab9a-4ae3-8414-d6e23a6698fe.jpg",
    read_time: 5,
    author: "Bob (Pilote & Logistique)",
    created_at: "2026-05-25T09:00:00Z"
  }
]

const SQL_CREATE_TABLE = `-- Requête de création de la table blog et pré-remplissage des articles
CREATE TABLE IF NOT EXISTS blog (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  content TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  image_url TEXT,
  read_time INTEGER NOT NULL DEFAULT 5,
  author TEXT NOT NULL DEFAULT 'Admin',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS (Row Level Security)
ALTER TABLE blog ENABLE ROW LEVEL SECURITY;

-- Autoriser la lecture publique
DROP POLICY IF EXISTS "Public read blog" ON blog;
CREATE POLICY "Public read blog" ON blog FOR SELECT USING (true);

-- Autoriser l'administration aux utilisateurs authentifiés
DROP POLICY IF EXISTS "Auth insert blog" ON blog;
CREATE POLICY "Auth insert blog" ON blog FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Auth update blog" ON blog;
CREATE POLICY "Auth update blog" ON blog FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Auth delete blog" ON blog;
CREATE POLICY "Auth delete blog" ON blog FOR DELETE TO authenticated USING (true);

-- Pré-remplissage avec les 4 articles par défaut (si la table est vide)
INSERT INTO blog (title, category, content, excerpt, image_url, read_time, author, created_at)
SELECT 'L''Épopée de la Team Mob Y Dick : De la passion à la boue', 'histoire', 'C''est dans un coin d''atelier encombré de vieilles pièces de Peugeot 103 et de Motobécane 51 qu''est née l''histoire de la team Mob Y Dick. À l''origine, une simple bande de copains d''enfance, partageant une fascination pour la mécanique vintage et la vitesse brute. Ce qui ne devait être qu''une blague un après-midi de printemps s''est rapidement transformé en une véritable passion pour le Mobcross, cette discipline unique qui voit s''affronter des cyclomoteurs modifiés sur des pistes de terre.

Le nom "Mob Y Dick" a été choisi en hommage aux célèbres machines bleues et au mythique monstre des mers, symbolisant notre quête pour dompter nos "monstres mécaniques" récalcitrants. Nos débuts ont été marqués par beaucoup de fumée, de rires et de pannes légendaires. Lors de notre première course, aucune meule n''a franchi la ligne d''arrivée, mais l''esprit de groupe était scellé.

Au fil des saisons, l''équipe s''est structurée. Nous avons adopté nos couleurs distinctives (rouge, orange et noir) et commencé à personnaliser nos motos avec des kits déco style graffiti uniques, peints à la main. Mais notre philosophie reste inchangée :

> "Chez nous, l''esprit d''équipe et la rigolade passent toujours avant la ligne d''arrivée. On rigole fort, on s''entraide au stand, et si une meule explose au bout de trois tours, c''est simplement l''excuse idéale pour ouvrir une bière et en discuter !"

Aujourd''hui, la team compte plus de 9 riders et une équipe mécanique dévouée, prête à en découdre sur toutes les pistes de France. La passion de la boue et du 2-temps coule définitivement dans nos veines !', 'Découvrez comment une bande de copains d''enfance a transformé de vieux cyclomoteurs Peugeot en véritables bêtes de course sur terre.', '/motos/2cd0ab6d-2472-4496-aac8-af9a290fbf14.jpg', 6, 'Fumax', '2026-05-20T10:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM blog WHERE title = 'L''Épopée de la Team Mob Y Dick : De la passion à la boue');

INSERT INTO blog (title, category, content, excerpt, image_url, read_time, author, created_at)
SELECT 'Préparation Moteur & Cycle : Comment monter une Mobcross de compétition', 'mecanique', 'Préparer un cyclomoteur de route Peugeot 103 pour lui faire subir les assauts du Mobcross est un art subtil qui demande rigueur, ingéniosité et patience. Notre chef mécanicien, Gauthier, nous livre ici les secrets de préparation de la célèbre "Beast R-1".

### 1. La préparation moteur (Le cœur du 2-temps)
Pour obtenir une accélération nerveuse à bas régime – essentielle pour s''extirper des virages boueux – nous modifions profondément le moteur :
- **Les carters d''origine** sont méticuleusement alignés avec les transferts du cylindre. Nous utilisons des clapets Athena en carbone pour optimiser le flux de gaz frais.
- **Le cylindre :** Nous restons sur une cylindrée de 50cc réglementaire pour la catégorie mais nous augmentons légèrement les diagrammes d''échappement (autour de 178°) et d''admission (120°) à la fraiseuse.
- **La carburation :** Nous installons un carburateur Dell''Orto PHBG de 15 ou 17,5 mm, avec un réglage de gicleur principal peaufiné en fonction du climat. Un filtre à air en mousse type cornet de motocross protège le tout de la poussière.
- **L''échappement :** Un pot de détente Giannelli Black Gun ou Doppler ER1, raccourci pour décaler la puissance dans les mi-régimes.

### 2. Le châssis et la partie cycle (Sécurité et rigidité)
Le cadre d''origine d''un Peugeot 103 n''est pas conçu pour faire des sauts. Sans modifications, il se plierait dès le premier saut.
- **Renfort de cadre :** Nous soudons une barre centrale en acier entre la colonne de direction et le tube de selle. Les carters et le bras oscillant reçoivent des plaques de renfort soudées au TIG.
- **Le bras oscillant :** Les bras oscillants d''origine ont tendance à vriller sous la tension de la chaîne. Nous installons un bras oscillant de Peugeot RCX renforcé ou fabriquons nos propres platines rigides.
- **Suspensions :** À l''avant, nous adaptons une fourche hydraulique renforcée provenant d''une mécaboite 50cc. À l''arrière, une paire d''amortisseurs réglables à gaz de 360 mm absorbe les chocs.
- **Pneumatiques :** Des pneus Michelin StarCross 5 ou Pirelli Scorpion MX montés sur des jantes à rayons renforcées de 17 pouces complètent la monte.

> "La préparation d''une mobcross est un équilibre permanent entre puissance brute et fiabilité. Une machine hyper performante qui serre au bout de deux tours ne vous fera jamais gagner de course."', 'Carburation, diagrammes de cylindre, renforts de cadre au TIG... Plongez dans les détails techniques de nos préparations Mobcross.', '/motos/05c88f5e-250c-41fa-bdc4-dc97b785cd54.jpg', 8, 'Gauthier', '2026-05-22T14:30:00Z'
WHERE NOT EXISTS (SELECT 1 FROM blog WHERE title = 'Préparation Moteur & Cycle : Comment monter une Mobcross de compétition');

INSERT INTO blog (title, category, content, excerpt, image_url, read_time, author, created_at)
SELECT 'Le Grand Récit du Championnat de France de Mobcross 2025', 'competition', 'La saison 2025 du Championnat de France de Mobcross restera gravée dans l''histoire de la team Mob Y Dick comme l''une des plus éparpillées, mais aussi l''une des plus mémorables. Retour sur les temps forts d''une année riche en adrénaline.

### Nozay : L''épreuve de la poussière
La première manche s''est déroulée sous un soleil de plomb et sur une piste sèche transformée en nuage de poussière géant. 
- **Manche 1 :** Très bon départ d''Alex sur la Beast R-1 qui se faufile en 3ème position. Malheureusement, après 4 tours, son embrayage commence à patiner sévèrement à cause de la surchauffe. Il finit difficilement à la 8ème place.
- **Manche 2 :** Après un changement d''embrayage express aux stands par Gauthier et StickMan, Alex repart gonflé à bloc et arrache la 5ème place après une bataille féroce dans le dernier tour.

### Saint-Vincent-des-Landes : L''enfer de la boue
Changement radical de décor pour la seconde épreuve : une pluie battante s''est abattue sur le circuit toute la nuit, transformant la piste en un bourbier sans nom. C''est ici que l''esprit de notre team a fait la différence.
Dans ces conditions extrêmes, les moteurs chauffent et aspirent de l''eau. Bob a connu une panne d''allumage dans la première manche. Gauthier a réussi à nettoyer et à étanchéifier le rotor sous la pluie battante en moins de 15 minutes. 
Grâce à un pilotage ultra-technique dans les ornières et à la fiabilité de nos filtres à air modifiés "anti-boue", Alex parvient à décrocher la 2ème place sur le podium de la journée !

### Bilan de la saison 2025
Grâce à une régularité exemplaire lors de la finale et à une solidarité sans faille au sein des stands (nous avons prêté un carburateur de rechange à une équipe concurrente en détresse), la team Mob Y Dick décroche une fantastique **3ème place au classement général par équipe du championnat** !

Un immense merci à nos sponsors locaux et à tous les supporters venus nous encourager au bord des pistes avec leurs fumigènes orange et rouge. Rendez-vous en 2026 pour viser le titre !', 'Revivez les manches mémorables de la saison 2025, de la poussière étouffante de Nozay jusqu''au podium boueux de Saint-Vincent.', '/motos/5e66cf75-e1de-41d7-8273-ed89eb9c8e3e.jpg', 7, 'Alex', '2026-05-24T18:15:00Z'
WHERE NOT EXISTS (SELECT 1 FROM blog WHERE title = 'Le Grand Récit du Championnat de France de Mobcross 2025');

INSERT INTO blog (title, category, content, excerpt, image_url, read_time, author, created_at)
SELECT 'Guide du Débutant : Comment se lancer dans le Mobcross ?', 'guide', 'Vous entendez le vrombissement rageur d''un moteur 2-temps, vous voyez des bécanes voler au-dessus des bosses et vous vous dites : "C''est ça qu''il me faut !" ? Vous avez raison. Le Mobcross est sans doute le sport mécanique le plus convivial, le plus fun et le plus accessible financièrement. Voici notre guide complet pour débuter dans les meilleures conditions.

### 1. Choisir sa base (Le choix de la meule)
Pour débuter, deux choix s''imposent en France :
- **Le Peugeot 103 (MVL, RCX, SPX) :** C''est la base la plus populaire. Les pièces de rechange sont abondantes, peu chères, et la mécanique est extrêmement simple à comprendre.
- **La Motobécane 51 (Club, Hard Rock, Magnum) :** Également très populaire, réputée pour son moteur AV10 très performant d''origine.

Pour vos premiers tours de roues, évitez les cadres trop modifiés. Trouvez une base saine d''origine, démontez-la entièrement pour nettoyer le réservoir, et commencez par y greffer une barre de renfort centrale soudée.

### 2. L''équipement de sécurité (Priorité absolue)
Même si l''on roule sur un cyclo de 50cc, les chutes font mal et la sécurité ne doit jamais être négligée. L''équipement obligatoire comprend :
- Un casque de motocross homologué.
- Des lunettes de protection (masque) anti-poussière.
- Une dorsale et un pare-pierres homologués FFM.
- Des bottes de motocross rigides (les baskets sont strictement interdites sur circuit).
- Des gants renforcés et une tenue en tissu résistant (pantalon et maillot de cross).

### 3. La licence et les clubs
Pour rouler en toute légalité et être couvert par les assurances, vous devez adhérer à un club affilié à la Fédération Française de Motocyclisme (FFM) ou à l''UFOLEP. Vous passerez un examen médical d''aptitude et obtiendrez votre licence annuelle de compétition ou d''entraînement.

### 4. Le budget estimé pour débuter
L''un des grands points forts du Mobcross est son coût dérisoire comparé au Motocross moderne :
- **Achat du cyclo d''occasion :** 300 € à 600 €
- **Pièces de préparation de base & pneus cross :** 250 €
- **Équipement de protection complet :** 300 €
- **Licence annuelle :** 150 €
- **Budget total estimé :** Environ 1000 € à 1300 € pour une première saison complète !

N''hésitez pas à venir nous voir lors des entraînements de la team Mob Y Dick ou à nous envoyer un message via notre formulaire de contact, nous serons ravis de vous conseiller pour votre premier montage !', 'Vous rêvez de tâter de la terre en 50cc ? Voici les conseils de la team pour choisir sa mobylette, s''équiper et obtenir sa licence.', '/motos/6c3be747-ab9a-4ae3-8414-d6e23a6698fe.jpg', 5, 'Bob', '2026-05-25T09:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM blog WHERE title = 'Guide du Débutant : Comment se lancer dans le Mobcross ?');`

const LOCAL_PHOTOS = [
  { url: "/motos/2cd0ab6d-2472-4496-aac8-af9a290fbf14.jpg", title: "Beast R-1 Rouge (Profil)" },
  { url: "/motos/05c88f5e-250c-41fa-bdc4-dc97b785cd54.jpg", title: "Storm O-4 Orange (Saut)" },
  { url: "/motos/5e66cf75-e1de-41d7-8273-ed89eb9c8e3e.jpg", title: "Stealth N-67 Noire" },
  { url: "/motos/6c3be747-ab9a-4ae3-8414-d6e23a6698fe.jpg", title: "Beast R-1 dans l'atelier" },
  { url: "/motos/5bebfecf-6fbf-4327-a6ec-59df4de8dffd.jpg", title: "Storm O-4 au stand" },
  { url: "/motos/6fae5df4-0ec9-4e66-ba64-885a453960df.jpg", title: "Stealth N-67 au départ" },
  { url: "/motos/9ee5fac2-769a-461d-9f22-936c44a2b717.jpg", title: "Détails moteur Beast R-1" },
  { url: "/motos/a5956043-1e5b-454c-82e1-db0afdad9d99.jpg", title: "Stealth N-67 en action" },
  { url: "/motos/c2b259ef-7132-42f1-bbe6-225949254c2a.jpg", title: "Amortisseur arrière Storm O-4" }
]

const renderInlineMarkdown = (text) => {
  if (!text) return '';
  const regex = /(!\[.*?\]\(.*?\))|(\*\*.*?\*\*)|(`.*?`)/g;
  const tokens = text.split(regex);
  
  return tokens.map((token, idx) => {
    if (token === undefined || token === '') return null;
    
    if (token.startsWith('![') && token.endsWith(')')) {
      const match = token.match(/!\[(.*?)\]\((.*?)\)/);
      if (match) {
        return (
          <span key={idx} className="article-inline-image-wrapper">
            <img src={match[2]} alt={match[1]} className="article-inline-img" />
            {match[1] && <span className="article-inline-img-caption">{match[1]}</span>}
          </span>
        );
      }
    }
    
    if (token.startsWith('**') && token.endsWith('**')) {
      return <strong key={idx}>{token.slice(2, -2)}</strong>;
    }
    
    if (token.startsWith('`') && token.endsWith('`')) {
      return <code key={idx}>{token.slice(1, -1)}</code>;
    }
    
    return token;
  });
};

const renderMarkdown = (content) => {
  if (!content) return null;
  const lines = content.split(/\r?\n/);
  const elements = [];
  let currentList = [];
  let currentQuote = [];
  let currentParagraph = [];

  const flushList = (key) => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`list-${key}`} className="article-ul">
          {currentList.map((item, idx) => (
            <li key={idx} className="article-li">
              {renderInlineMarkdown(item)}
            </li>
          ))}
        </ul>
      );
      currentList = [];
    }
  };

  const flushQuote = (key) => {
    if (currentQuote.length > 0) {
      elements.push(
        <blockquote key={`quote-${key}`} className="article-blockquote">
          {renderInlineMarkdown(currentQuote.join('\n'))}
        </blockquote>
      );
      currentQuote = [];
    }
  };

  const flushParagraph = (key) => {
    if (currentParagraph.length > 0) {
      elements.push(
        <p key={`p-${key}`} className="article-p">
          {renderInlineMarkdown(currentParagraph.join(' '))}
        </p>
      );
      currentParagraph = [];
    }
  };

  const flushAll = (key) => {
    flushList(key);
    flushQuote(key);
    flushParagraph(key);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line === '') {
      flushAll(i);
      continue;
    }

    if (line.startsWith('- ') || line.startsWith('* ')) {
      flushQuote(i);
      flushParagraph(i);
      currentList.push(line.substring(2));
      continue;
    }

    if (line.startsWith('>')) {
      flushList(i);
      flushParagraph(i);
      const quoteText = line.substring(1).replace(/^\s*"/, '').replace(/"\s*$/, '').trim();
      currentQuote.push(quoteText);
      continue;
    }

    if (line.startsWith('### ')) {
      flushAll(i);
      elements.push(<h3 key={i} className="article-h3">{renderInlineMarkdown(line.substring(4))}</h3>);
      continue;
    }
    if (line.startsWith('## ')) {
      flushAll(i);
      elements.push(<h2 key={i} className="article-h2">{renderInlineMarkdown(line.substring(3))}</h2>);
      continue;
    }
    if (line.startsWith('# ')) {
      flushAll(i);
      elements.push(<h1 key={i} className="article-h1">{renderInlineMarkdown(line.substring(2))}</h1>);
      continue;
    }

    const imgMatch = line.match(/^!\[(.*?)\]\((.*?)\)$/);
    if (imgMatch) {
      flushAll(i);
      elements.push(
        <div key={i} className="article-image-container">
          <img src={imgMatch[2]} alt={imgMatch[1]} className="article-inline-img" />
          {imgMatch[1] && <span className="article-image-caption">{imgMatch[1]}</span>}
        </div>
      );
      continue;
    }

    flushList(i);
    flushQuote(i);
    currentParagraph.push(line);
  }

  flushAll(lines.length);
  return elements;
};

const Blog = ({ hasPermission, isAdmin, profile, navigate }) => {
  const [articles, setArticles] = useState([])
  const [selectedArticle, setSelectedArticle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dbError, setDbError] = useState(false)

  // Editor states
  const [showEditor, setShowEditor] = useState(false)
  const [editingArticle, setEditingArticle] = useState(null)
  const [formData, setFormData] = useState({
    title: '',
    category: 'mecanique',
    content: '',
    excerpt: '',
    image_url: '',
    read_time: 5,
    author: ''
  })
  const [submitting, setSubmitting] = useState(false)

  // AI assistant states
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [galleryPhotos, setGalleryPhotos] = useState([])
  const [selectedPhotos, setSelectedPhotos] = useState([])
  const [customApiKey, setCustomApiKey] = useState(localStorage.getItem('myd_gemini_api_key') || '')
  // Photos ajoutées spécifiquement pour CET article : uploadées dans le bucket de
  // stockage 'Gallery' mais JAMAIS insérées dans la table `gallery`, donc invisibles
  // dans la galerie publique du site. Disponibles à l'IA et à l'insertion manuelle.
  const [articlePhotos, setArticlePhotos] = useState([])
  const [articlePhotoUploading, setArticlePhotoUploading] = useState(false)
  const articlePhotoInputRef = useRef(null)

  const canManage = hasPermission('manage_blog') || isAdmin || (profile && ['moderator', 'organisateur'].includes(profile.role))

  // Liste unique des photos proposées à l'IA et à l'insertion : d'abord celles
  // propres à l'article, puis la galerie du site, puis les photos locales statiques.
  const availablePhotos = (() => {
    const seen = new Set()
    const out = []
    const all = [
      ...articlePhotos,
      ...galleryPhotos.map(p => ({ url: p.url, title: p.title || 'Photo Galerie' })),
      ...LOCAL_PHOTOS,
    ]
    all.forEach(p => {
      if (p.url && !seen.has(p.url)) { seen.add(p.url); out.push(p) }
    })
    return out
  })()

  // Upload de photos rattachées uniquement à l'article (jamais ajoutées à la galerie).
  const handleArticlePhotoFiles = async (e) => {
    const files = Array.from(e.target.files || [])
    if (articlePhotoInputRef.current) articlePhotoInputRef.current.value = ''
    if (files.length === 0) return
    if (!supabase) {
      alert("Stockage indisponible : une connexion Supabase est nécessaire pour ajouter des photos.")
      return
    }
    setArticlePhotoUploading(true)
    try {
      for (const file of files) {
        if (!file.type.startsWith('image/')) { alert(`"${file.name}" n'est pas une image, ignoré.`); continue }
        if (file.size > 20 * 1024 * 1024) { alert(`"${file.name}" dépasse 20 Mo, ignoré.`); continue }
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
        const fileName = `blog/article-photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('Gallery')
          .upload(fileName, file, { upsert: true, contentType: file.type })
        if (upErr) { alert(`Échec de l'upload de "${file.name}" : ${upErr.message}`); continue }
        const { data } = supabase.storage.from('Gallery').getPublicUrl(fileName)
        const url = `${data.publicUrl}?t=${Date.now()}`
        const title = file.name.replace(/\.[^.]+$/, '') || 'Photo article'
        setArticlePhotos(prev => [...prev, { url, title }])
        setSelectedPhotos(prev => prev.includes(url) ? prev : [...prev, url])
      }
    } catch (err) {
      alert("Erreur lors de l'ajout des photos : " + (err?.message || err))
    } finally {
      setArticlePhotoUploading(false)
    }
  }

  // ─── Illustration : sélection fichier → cropper → upload (même système que les motos/avatars) ───
  const illustrationInputRef = useRef(null)
  const [cropperSrc, setCropperSrc] = useState(null)
  const [imgUploading, setImgUploading] = useState(false)

  const handleIllustrationFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { alert('Le fichier doit être une image.'); return }
    if (file.size > 20 * 1024 * 1024) { alert('Image trop lourde (max 20 Mo). Le recadrage se charge de la compression.'); return }
    const reader = new FileReader()
    reader.onload = () => setCropperSrc(reader.result)
    reader.onerror = () => alert('Impossible de lire ce fichier.')
    reader.readAsDataURL(file)
    if (illustrationInputRef.current) illustrationInputRef.current.value = ''
  }

  const blobToDataURL = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsDataURL(blob)
  })

  const handleIllustrationCropConfirm = async (blob, ext) => {
    setCropperSrc(null)
    setImgUploading(true)
    try {
      let url = null
      if (supabase) {
        try {
          const fileName = `blog/illustration-${Date.now()}.${ext}`
          const { error: upErr } = await supabase.storage
            .from('Gallery')
            .upload(fileName, blob, { upsert: true, contentType: blob.type })
          if (upErr) throw upErr
          const { data } = supabase.storage.from('Gallery').getPublicUrl(fileName)
          url = `${data.publicUrl}?t=${Date.now()}`
        } catch (err) {
          console.warn('Upload Supabase échoué, bascule sur un data URL local.', err)
        }
      }
      if (!url) url = await blobToDataURL(blob) // fallback hors-ligne / storage indispo
      setFormData(prev => ({ ...prev, image_url: url }))
    } catch (err) {
      alert("Erreur lors du traitement de l'image : " + (err?.message || err))
    } finally {
      setImgUploading(false)
    }
  }

  const fetchArticles = async () => {
    setLoading(true)
    if (!supabase) {
      setArticles(STATIC_ARTICLES)
      setDbError(true)
      setLoading(false)
      return
    }

    try {
      const { data, error } = await supabase
        .from('blog')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      if (data && data.length > 0) {
        setArticles(data)
      } else {
        // Table exists but is empty, pre-populate with static articles in state
        setArticles(STATIC_ARTICLES)
      }
      setDbError(false)
    } catch (err) {
      console.warn("Supabase blog fetch failed, using fallback static articles.", err)
      setArticles(STATIC_ARTICLES)
      // Check if error is due to missing relation (table doesn't exist)
      if (err.message && (err.message.includes('relation "blog" does not exist') || err.code === '42P01')) {
        setDbError(true)
      }
    } finally {
      setLoading(false)
    }
  }

  const fetchPhotos = async () => {
    if (!supabase) return
    try {
      const { data, error } = await supabase
        .from('gallery')
        .select('*')
        .eq('type', 'photo')
        .order('created_at', { ascending: false })
      if (error) throw error
      if (data) {
        setGalleryPhotos(data)
      }
    } catch (err) {
      console.warn("Could not load gallery photos for AI Assistant:", err)
    }
  }

  useEffect(() => {
    fetchArticles()
    fetchPhotos()
  }, [])

  const handleAiGenerate = async () => {
    const geminiKey = import.meta.env.VITE_GEMINI_API_KEY || customApiKey
    if (!geminiKey) {
      alert("Veuillez configurer une clé API Gemini (dans le champ dédié ou via VITE_GEMINI_API_KEY).")
      return
    }

    setAiGenerating(true)

    // Photos disponibles (article + galerie + locales), déjà dédupliquées.
    const uniquePhotos = availablePhotos

    const isEditing = !!editingArticle
    const currentArticleContext = isEditing 
      ? `Voici l'article actuel en cours d'édition (Titre actuel: "${formData.title}", Catégorie actuelle: "${formData.category}", Description actuelle: "${formData.excerpt}", Contenu actuel: "${formData.content}").`
      : ''

    const promptText = `
Tu es l'assistant de rédaction officiel de la team Mob Y Dick (mobcross de compétition).
${isEditing 
  ? `Tu dois MODIFIER l'article existant en appliquant les consignes suivantes : "${aiPrompt}".
    ${currentArticleContext}
    Applique rigoureusement les modifications demandées (comme insérer/swap de nouvelles photos, modifier un passage, changer le ton, ou traduire) tout en conservant l'essence et le style original du texte lorsque c'est pertinent.`
  : `Rédige un article de blog complet, de haute qualité en français basé sur les instructions suivantes : "${aiPrompt}".`
}

Le ton de l'article doit correspondre à la catégorie sélectionnée ("${formData.category}").
Si c'est "mecanique", utilise un ton technique et explicatif de mécanicien expert.
Si c'est "competition", utilise un ton dynamique et captivant de reporter sportif.
Si c'est "histoire", utilise un ton nostalgique, chaleureux et passionné.
Si c'est "guide", utilise un ton pédagogique, clair et structuré.

Tu DOIS impérativement utiliser et incorporer tout ou partie des photos sélectionnées ci-dessous à des moments logiques du texte pour l'illustrer. Utilise la syntaxe Markdown exacte : ![Légende de la photo](URL)
Voici la liste des photos sélectionnées par l'utilisateur :
${selectedPhotos.length > 0 
  ? selectedPhotos.map(url => {
      const match = uniquePhotos.find(p => p.url === url);
      return `- URL: "${url}", Description suggérée: "${match?.title || 'Photo'}"`;
    }).join('\n')
  : "- Aucune photo sélectionnée."
}

Consignes de structure :
1. Écris des titres de sections clairs avec "###" (et ajoute des émojis au début du titre).
2. Utilise des listes à puces avec "-" pour énumérer des détails.
3. Utilise des citations inspirantes ou des déclarations fortes avec ">".
4. Rend l'article long, riche en vocabulaire de mobcross / mécanique / course 2-temps de campagne, vivant et engageant (entre 300 et 600 mots).

Renvoie obligatoirement ta réponse sous la forme d'un objet JSON strict avec la structure suivante :
{
  "title": "Titre accrocheur de l'article avec émojis",
  "category": "${formData.category}",
  "excerpt": "Une courte introduction / phrase d'accroche captivante (1-2 phrases)",
  "read_time": 5,
  "content": "Le corps de l'article en Markdown complet avec titres, paragraphes, citations, et les images intégrées avec la syntaxe ![Description](URL)"
}

Renvoie UNIQUEMENT le JSON brut, sans blocs de code Markdown (pas de \`\`\`json ou \`\`\`), sans texte explicatif avant ou après. La réponse doit être directement analysable par JSON.parse().
`;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: promptText
            }]
          }],
          generationConfig: {
            responseMimeType: "application/json"
          }
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const resData = await response.json()
      const generatedText = resData.candidates?.[0]?.content?.parts?.[0]?.text
      if (!generatedText) throw new Error("Réponse vide de l'IA.")

      let cleanText = generatedText.trim()
      if (cleanText.includes('```')) {
        const match = cleanText.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
        if (match) {
          cleanText = match[1].trim()
        }
      }

      const parsed = JSON.parse(cleanText)
      
      setFormData(prev => ({
        ...prev,
        title: parsed.title || prev.title,
        category: parsed.category || prev.category,
        excerpt: parsed.excerpt || prev.excerpt,
        read_time: parseInt(parsed.read_time) || prev.read_time || 5,
        content: parsed.content || prev.content,
        image_url: selectedPhotos[0] || parsed.image_url || prev.image_url || ''
      }))

      alert("✨ Article rédigé avec succès par l'IA ! Vous pouvez maintenant le relire et l'ajuster ci-dessous avant de le publier.")
    } catch (err) {
      console.error(err)
      alert("Erreur lors de la génération par l'IA : " + err.message + "\n\nAssurez-vous que votre clé API est valide et que la consigne est claire.")
    } finally {
      setAiGenerating(false)
    }
  }

  const insertAtCursor = (textToInsert) => {
    const textarea = document.getElementById('blog-content-textarea')
    if (!textarea) {
      setFormData(prev => ({ ...prev, content: prev.content + textToInsert }))
      return
    }

    const startPos = textarea.selectionStart
    const endPos = textarea.selectionEnd
    const text = formData.content

    const newContent = text.substring(0, startPos) + textToInsert + text.substring(endPos)
    setFormData(prev => ({ ...prev, content: newContent }))

    setTimeout(() => {
      textarea.focus()
      const newCursorPos = startPos + textToInsert.length
      textarea.setSelectionRange(newCursorPos, newCursorPos)
    }, 50)
  }

  const handleOpenAdd = () => {
    setEditingArticle(null)
    setFormData({
      title: '',
      category: 'mecanique',
      content: '',
      excerpt: '',
      image_url: '',
      read_time: 5,
      author: profile?.display_name || profile?.email?.split('@')[0] || 'Admin'
    })
    setArticlePhotos([])
    setSelectedPhotos([])
    setShowEditor(true)
  }

  const handleOpenEdit = (e, article) => {
    e.stopPropagation()
    setEditingArticle(article)
    setFormData({
      title: article.title,
      category: article.category,
      content: article.content,
      excerpt: article.excerpt || '',
      image_url: article.image_url || '',
      read_time: article.read_time || 5,
      author: article.author || 'Admin'
    })
    setArticlePhotos([])
    setSelectedPhotos([])
    setShowEditor(true)
  }

  const handleDelete = async (e, articleId) => {
    e.stopPropagation()
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer cet article ?")) return

    if (String(articleId).startsWith('static-')) {
      // For fallback articles, just filter out from state
      setArticles(prev => prev.filter(a => a.id !== articleId))
      if (selectedArticle && selectedArticle.id === articleId) {
        setSelectedArticle(null)
      }
      return
    }

    try {
      const { error } = await supabase.from('blog').delete().eq('id', articleId)
      if (error) throw error
      fetchArticles()
      if (selectedArticle && selectedArticle.id === articleId) {
        setSelectedArticle(null)
      }
    } catch (err) {
      alert("Erreur lors de la suppression : " + err.message)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)

    if (dbError) {
      // In offline/fallback mode, simulate saving directly in state
      const now = new Date().toISOString()
      if (editingArticle) {
        setArticles(prev => prev.map(a => a.id === editingArticle.id ? { ...a, ...formData } : a))
        if (selectedArticle && selectedArticle.id === editingArticle.id) {
          setSelectedArticle({ ...selectedArticle, ...formData })
        }
      } else {
        const newArt = {
          id: 'static-' + Date.now(),
          ...formData,
          created_at: now
        }
        setArticles(prev => [newArt, ...prev])
      }
      setShowEditor(false)
      setSubmitting(false)
      return
    }

    try {
      if (editingArticle && !String(editingArticle.id).startsWith('static-')) {
        const { error } = await supabase
          .from('blog')
          .update(formData)
          .eq('id', editingArticle.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('blog')
          .insert([formData])
        if (error) throw error
      }
      setShowEditor(false)
      fetchArticles()
      // If we are currently viewing the edited article, update it
      if (editingArticle && selectedArticle && selectedArticle.id === editingArticle.id) {
        setSelectedArticle({ ...selectedArticle, ...formData })
      }
    } catch (err) {
      alert("Erreur lors de la sauvegarde : " + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const getCategoryLabel = (cat) => {
    switch (cat) {
      case 'mecanique': return '🔧 Mécanique'
      case 'histoire': return '📚 Histoire'
      case 'competition': return '🏆 Compétition'
      case 'guide': return '💡 Guide'
      default: return '📝 Article'
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  }

  return (
    <section className="section page-top">
      <div className="container">
        
        {/* Back button & title logic */}
        {!selectedArticle ? (
          <div className="section-header">
            <span className="section-tag">Blog & Actualités</span>
            <h2>La Vie de la Team</h2>
            <p className="section-sub">
              Tutoriels mécaniques, récits épiques de courses et chroniques de la meute.
            </p>
            {canManage && (
              <button className="btn btn-primary btn-sm inline-add-btn" onClick={handleOpenAdd}>
                ➕ Ajouter un Article
              </button>
            )}
          </div>
        ) : (
          <button className="blog-back-btn" onClick={() => setSelectedArticle(null)}>
            ← Retour aux articles
          </button>
        )}

        {/* Database notice warning for Admins */}
        {dbError && canManage && !selectedArticle && (
          <div className="blog-sql-alert">
            <h4 className="text-accent" style={{ margin: '0 0 10px 0', fontSize: '1rem', fontWeight: 'bold' }}>
              🔧 Activation de l'édition dynamique du Blog (Supabase)
            </h4>
            <p>
              La table <code>blog</code> n'existe pas encore dans votre base de données Supabase. Pour pouvoir ajouter, modifier ou supprimer des articles directement depuis ce cockpit, copiez la requête SQL ci-dessous, allez dans votre <strong>Dashboard Supabase</strong> → <strong>SQL Editor</strong> → cliquez sur <strong>New Query</strong>, collez-la et cliquez sur <strong>Run</strong>.
            </p>
            <textarea readOnly value={SQL_CREATE_TABLE} onClick={(e) => e.target.select()} />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              💡 Cliquez dans le champ pour tout sélectionner. En attendant, le site affiche les articles de démonstration ci-dessous en mode lecture seule sécurisé.
            </span>
          </div>
        )}

        {/* Loading state */}
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '30vh', gap: '12px', color: 'var(--text-muted)' }}>
            <span style={{ width: '24px', height: '24px', border: '3px solid rgba(255,255,255,0.15)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            Chargement des articles...
          </div>
        ) : (
          <>
            {/* GRID OF ARTICLES */}
            {!selectedArticle ? (
              articles.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
                  <span style={{ fontSize: '2.5rem' }}>📝</span>
                  <p style={{ margin: '15px 0 0 0' }}>Aucun article n'a été publié pour le moment.</p>
                </div>
              ) : (
                <div className="blog-grid">
                  {articles.map((art) => (
                    <div 
                      key={art.id} 
                      className="blog-card"
                      onClick={() => setSelectedArticle(art)}
                    >
                      {/* Admin actions overlay */}
                      {canManage && (
                        <div className="blog-card-admin-actions">
                          <button 
                            className="blog-admin-btn edit" 
                            onClick={(e) => handleOpenEdit(e, art)}
                            title="Modifier"
                          >
                            ✏️
                          </button>
                          <button 
                            className="blog-admin-btn delete" 
                            onClick={(e) => handleDelete(e, art.id)}
                            title="Supprimer"
                          >
                            🗑️
                          </button>
                        </div>
                      )}

                      <div className="blog-card-img-wrap">
                        {art.image_url ? (
                          <img src={art.image_url} alt={art.title} className="blog-card-img" loading="lazy" />
                        ) : (
                          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #1f1f1f, #0d0d0d)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem' }}>
                            🏍️
                          </div>
                        )}
                      </div>

                      <div className="blog-card-content">
                        <div className="blog-meta">
                          <span className={`blog-badge ${art.category || 'mecanique'}`}>
                            {getCategoryLabel(art.category)}
                          </span>
                          <span className="blog-read-time">
                            ⏱️ {art.read_time || 5} min
                          </span>
                        </div>

                        <h3 className="blog-card-title">{art.title}</h3>
                        <p className="blog-card-desc">
                          {art.excerpt || (art.content ? art.content.slice(0, 120) + '...' : '')}
                        </p>

                        <div className="blog-card-footer">
                          <span className="blog-date">{formatDate(art.created_at)}</span>
                          <button className="blog-more-btn">
                            Lire la suite →
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              /* DETAILED VIEW */
              <div className="article-container">
                <div className="article-hero">
                  {selectedArticle.image_url ? (
                    <img src={selectedArticle.image_url} alt={selectedArticle.title} className="article-hero-img" />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #1f1f1f, #0d0d0d)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '5rem' }}>
                      🏍️
                    </div>
                  )}
                  <div className="article-hero-overlay">
                    <span className={`blog-badge ${selectedArticle.category}`} style={{ width: 'fit-content' }}>
                      {getCategoryLabel(selectedArticle.category)}
                    </span>
                    <h1 className="article-title">{selectedArticle.title}</h1>
                    <div style={{ display: 'flex', gap: '15px', marginTop: '12px', fontSize: '0.88rem', color: 'rgba(255,255,255,0.7)', flexWrap: 'wrap' }}>
                      <span>👤 Par {selectedArticle.author || 'Admin'}</span>
                      <span>⏱️ {selectedArticle.read_time || 5} min de lecture</span>
                      <span>📅 Publié le {formatDate(selectedArticle.created_at)}</span>
                    </div>
                  </div>
                </div>

                <div className="article-body">
                  <div className="article-content">
                    {renderMarkdown(selectedArticle.content)}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ARTICLE EDITOR MODAL */}
      {showEditor && (
        <div className="blog-editor-overlay">
          <div className="blog-editor-modal glass">
            <h3>{editingArticle ? '✏️ Modifier l\'article' : '➕ Ajouter un article'}</h3>
            
            {/* AI Assistant Section */}
            <div className="blog-ai-panel">
              <span className="blog-ai-tag">🤖 Assistant de Rédaction IA (Gemini)</span>
              
              <div className="blog-ai-input-row">
                <textarea 
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Que voulez-vous raconter dans cet article ? (ex: Raconte la course à Nozay sous le soleil avec Alex qui gagne et StickMan qui casse son embrayage...)"
                  rows="2"
                  disabled={aiGenerating}
                  className="blog-ai-prompt-input"
                />
                <button 
                  type="button" 
                  className={`btn blog-ai-gen-btn ${aiGenerating ? 'loading' : ''}`}
                  onClick={handleAiGenerate}
                  disabled={aiGenerating || !aiPrompt.trim()}
                >
                  {aiGenerating ? '⏳ Rédaction...' : '✨ Rédiger'}
                </button>
              </div>

              {/* Photos Selection Checklist */}
              {(() => {
                const uniquePhotos = availablePhotos

                return (
                  <div className="blog-ai-photos-section">
                    <div className="blog-ai-photos-head">
                      <label className="blog-ai-photos-label">
                        📸 Cochez les photos à intégrer dans le texte :
                      </label>
                      <button
                        type="button"
                        className="blog-ai-photo-upload-btn"
                        onClick={() => articlePhotoInputRef.current?.click()}
                        disabled={articlePhotoUploading}
                        title="Ajouter des photos visibles uniquement dans cet article (elles ne sont pas publiées dans la galerie)"
                      >
                        {articlePhotoUploading ? '⏳ Envoi…' : '📤 Ajouter mes photos'}
                      </button>
                      <input
                        ref={articlePhotoInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        style={{ display: 'none' }}
                        onChange={handleArticlePhotoFiles}
                      />
                    </div>
                    <div className="blog-ai-photos-grid">
                      {uniquePhotos.map((photo) => {
                        const isSelected = selectedPhotos.includes(photo.url);
                        return (
                          <div 
                            key={photo.url} 
                            className={`blog-ai-photo-thumb ${isSelected ? 'selected' : ''}`}
                            onClick={() => {
                              if (isSelected) {
                                setSelectedPhotos(prev => prev.filter(u => u !== photo.url));
                              } else {
                                setSelectedPhotos(prev => [...prev, photo.url]);
                              }
                            }}
                            title={photo.title}
                          >
                            <img src={photo.url} alt={photo.title} />
                            <div className="blog-ai-photo-check">✓</div>
                            {articlePhotos.some(ap => ap.url === photo.url) && (
                              <div className="blog-ai-photo-badge">Article</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Custom API Key input if the key is not set in environment */}
              {!import.meta.env.VITE_GEMINI_API_KEY && (
                <div className="blog-ai-key-input">
                  <input 
                    type="password"
                    placeholder="Saisissez votre clé API Gemini si besoin..."
                    value={customApiKey}
                    onChange={(e) => {
                      setCustomApiKey(e.target.value);
                      localStorage.setItem('myd_gemini_api_key', e.target.value);
                    }}
                  />
                </div>
              )}
            </div>

            <form onSubmit={handleSubmit}>
              
              <div className="blog-form-group">
                <label>Titre de l'article</label>
                <input 
                  type="text" 
                  value={formData.title} 
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })} 
                  placeholder="Ex: Préparation Moteur Peugeot 103"
                  required 
                />
              </div>

              <div className="blog-form-row">
                <div className="blog-form-group">
                  <label>Auteur</label>
                  <input 
                    type="text" 
                    value={formData.author} 
                    onChange={(e) => setFormData({ ...formData, author: e.target.value })} 
                    placeholder="Ex: Gauthier (Chef Mécano)"
                    required 
                  />
                </div>
                
                <div className="blog-form-group">
                  <label>Temps de lecture (minutes)</label>
                  <input 
                    type="number" 
                    min="1"
                    max="60"
                    value={formData.read_time} 
                    onChange={(e) => setFormData({ ...formData, read_time: parseInt(e.target.value) || 5 })} 
                    required 
                  />
                </div>
              </div>

              <div className="blog-form-row">
                <div className="blog-form-group">
                  <label>Catégorie</label>
                  <select 
                    value={formData.category} 
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  >
                    <option value="mecanique">🔧 Mécanique</option>
                    <option value="histoire">📚 Histoire</option>
                    <option value="competition">🏆 Compétition</option>
                    <option value="guide">💡 Guide</option>
                  </select>
                </div>

                <div className="blog-form-group">
                  <label>URL de l'image (optionnel — ou recadre ci-dessous)</label>
                  <input 
                    type="text" 
                    value={formData.image_url} 
                    onChange={(e) => setFormData({ ...formData, image_url: e.target.value })} 
                    placeholder="Ex: /motos/2cd0ab6d.jpg"
                  />
                </div>
              </div>

              <div className="blog-form-group">
                <label>Illustration de l'article</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {formData.image_url ? (
                    <img
                      src={formData.image_url}
                      alt="Aperçu de l'illustration"
                      style={{ width: '100%', aspectRatio: '3 / 2', maxHeight: '220px', objectFit: 'cover', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)', background: '#0a0a0a' }}
                    />
                  ) : (
                    <div style={{ width: '100%', aspectRatio: '3 / 2', maxHeight: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.6rem', borderRadius: '10px', border: '1px dashed rgba(255,255,255,0.18)', background: '#0a0a0a', color: 'var(--text-muted)' }}>
                      🏍️
                    </div>
                  )}
                  <input
                    ref={illustrationInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleIllustrationFile}
                    style={{ display: 'none' }}
                  />
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => illustrationInputRef.current?.click()}
                      disabled={imgUploading}
                    >
                      {imgUploading ? '⏳ Traitement…' : (formData.image_url ? '🖼️ Nouveau fichier' : '🖼️ Choisir une image à recadrer')}
                    </button>
                    {formData.image_url && !imgUploading && (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => setCropperSrc(formData.image_url)}
                      >
                        ♻️ Recadrer l'image actuelle
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="blog-form-group">
                <label>Description courte (extrait)</label>
                <input 
                  type="text" 
                  value={formData.excerpt} 
                  onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })} 
                  placeholder="Ex: Carburation, renforts... les astuces techniques de nos prépa mobcross."
                  required
                />
              </div>

              <div className="blog-form-group">
                <label>Contenu de l'article (Markdown supporté)</label>
                
                {/* Formatting Toolbar */}
                <div className="blog-editor-toolbar">
                  <button type="button" className="blog-toolbar-btn" onClick={() => insertAtCursor('### 📝 Titre de section\n')} title="Insérer un Titre de section">🏛️ Titre</button>
                  <button type="button" className="blog-toolbar-btn" onClick={() => insertAtCursor('**texte en gras**')} title="Mettre en Gras"><b>G</b> Gras</button>
                  <button type="button" className="blog-toolbar-btn" onClick={() => insertAtCursor('> "Citation"\n')} title="Insérer une Citation">💬 Citation</button>
                  <button type="button" className="blog-toolbar-btn" onClick={() => insertAtCursor('- Un élément de liste\n')} title="Insérer une Liste à puces">• Liste</button>
                </div>

                {/* Click to Insert Photo grid */}
                {(() => {
                  const uniquePhotos = availablePhotos

                  return (
                    <div className="blog-photos-inserter-section">
                      <span className="blog-photos-inserter-label">
                        📸 Positionnez le curseur dans le texte et cliquez sur une photo ci-dessous pour l'insérer :
                      </span>
                      <div className="blog-photos-inserter-grid">
                        {uniquePhotos.map((photo) => (
                          <div 
                            key={photo.url} 
                            className="blog-inserter-photo-thumb"
                            onClick={() => insertAtCursor(`\n![${photo.title}](${photo.url})\n`)}
                            title={`Cliquer pour insérer : ${photo.title}`}
                          >
                            <img src={photo.url} alt={photo.title} />
                            <div className="blog-inserter-photo-overlay">➕ Insérer</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}

                <textarea 
                  id="blog-content-textarea"
                  rows="12"
                  value={formData.content} 
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })} 
                  placeholder="Rédigez l'article ici ou utilisez l'assistant IA ci-dessus. Cliquez sur les photos pour les intégrer directement."
                  required
                />
              </div>

              <div className="blog-form-actions">
                <button 
                  type="button" 
                  className="btn btn-ghost" 
                  onClick={() => setShowEditor(false)}
                  disabled={submitting}
                >
                  Annuler
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  disabled={submitting}
                >
                  {submitting ? 'Enregistrement...' : '🔥 Publier'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Cropper d'illustration (même système que les motos / avatars) — au-dessus de l'éditeur */}
      {cropperSrc && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 13000 }}>
          <MotoCropper
            imageSrc={cropperSrc}
            title="🖼️ Recadrer l'illustration"
            hint={<>Déplace et zoome — tu peux aussi <strong>dézoomer</strong> pour tout faire rentrer. L'illustration sera rognée en <strong>3:2 paysage</strong> et compressée automatiquement.</>}
            onCancel={() => setCropperSrc(null)}
            onConfirm={handleIllustrationCropConfirm}
          />
        </div>,
        document.body
      )}
    </section>
  )
}

export default Blog
