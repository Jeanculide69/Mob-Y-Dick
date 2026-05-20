-- ==========================================
-- MIGRATION V14 : NOUVELLES ANIMATIONS PREMIUM
-- Mob Y Dick — À exécuter dans Supabase SQL Editor
-- ==========================================
-- Ajoute 7 nouvelles emotes/sons thème motocross, fun, réactions
-- Met à jour les sons des items existants (les anciens étaient bloqués par CORS)
-- Met à jour le pack premium pour inclure les nouveaux items
-- ==========================================

-- 1. Corriger les sons des items existants (soundjay bloque le hotlinking !)
UPDATE public.shop_items SET 
  sound_url = 'https://cdn.freesound.org/previews/368/368691_6476533-lq.mp3',
  animation_url = 'https://media.giphy.com/media/3o7TKNdE3FMxMx0dVe/giphy.gif'
WHERE slug = 'emote_poop';

UPDATE public.shop_items SET 
  sound_url = 'https://cdn.freesound.org/previews/524/524619_7724054-lq.mp3',
  animation_url = 'https://media.giphy.com/media/xT5LMQ8rHYTDGFG07e/giphy.gif'
WHERE slug = 'emote_fart';

UPDATE public.shop_items SET 
  sound_url = 'https://cdn.freesound.org/previews/159/159080_2868144-lq.mp3'
WHERE slug = 'sound_horn';

UPDATE public.shop_items SET 
  sound_url = 'https://cdn.freesound.org/previews/277/277021_5123851-lq.mp3',
  animation_url = 'https://media.giphy.com/media/x0npYExCGOZeo/giphy.gif'
WHERE slug = 'emote_clown';

UPDATE public.shop_items SET 
  sound_url = 'https://cdn.freesound.org/previews/351/351338_4502230-lq.mp3',
  animation_url = 'https://media.giphy.com/media/Lopx9eUi34rbq/giphy.gif'
WHERE slug = 'emote_fire';


-- 2. Ajouter les nouvelles animations
INSERT INTO public.shop_items (slug, name, description, type, price_cents, emoji, animation_url, sound_url, sort_order)
VALUES 
  ('emote_wheelie', '🏍️ Wheelie de Folie', 'Une moto qui fait un wheelie épique sur le live !', 'emote_sound', 300, '🏍️', 'https://media.giphy.com/media/37lUupgTHHm2Q/giphy.gif', 'https://cdn.freesound.org/previews/370/370220_6612076-lq.mp3', 6),
  ('emote_crash', '💥 Crash Spectaculaire', 'BOOM ! Une gamelle mémorable qui fait rire tout le monde.', 'emote_sound', 200, '💥', 'https://media.giphy.com/media/3ohhwvcRk2NDL7fKsE/giphy.gif', 'https://cdn.freesound.org/previews/514/514647_6890498-lq.mp3', 7),
  ('emote_trophy', '🏆 Champion du Monde', 'Célèbre la victoire avec une pluie de confettis et une coupe géante !', 'emote_sound', 300, '🏆', 'https://media.giphy.com/media/g9582DNuQppxC/giphy.gif', 'https://cdn.freesound.org/previews/270/270402_5123851-lq.mp3', 8),
  ('sound_airhorn', '📣 Air Horn de Stade', 'Le fameux coup de corne de brume qui réveille tout le circuit !', 'sound', 200, '📣', NULL, 'https://cdn.freesound.org/previews/352/352661_6476533-lq.mp3', 9),
  ('emote_rooster', '🐔 Rooster Tail', 'Envoie un énorme jet de boue sur tout le live !', 'emote_sound', 200, '🐔', 'https://media.giphy.com/media/MBrwSn16nlfP02BJ1A/giphy.gif', 'https://cdn.freesound.org/previews/432/432206_4939974-lq.mp3', 10),
  ('emote_laughcry', '🤣 Mort de Rire', 'Explose de rire avec un éclat de rire contagieux en plein live !', 'emote_sound', 200, '🤣', 'https://media.giphy.com/media/10JhviFuU2gWD6/giphy.gif', 'https://cdn.freesound.org/previews/434/434472_3232073-lq.mp3', 11),
  ('emote_mindblown', '🤯 Mind Blown', 'Quand un passage est tellement rapide que ton cerveau explose.', 'emote_sound', 300, '🤯', 'https://media.giphy.com/media/xT0xeJpnrWC3XWblEk/giphy.gif', 'https://cdn.freesound.org/previews/523/523223_6142149-lq.mp3', 12)
ON CONFLICT (slug) DO UPDATE SET 
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  type = EXCLUDED.type,
  price_cents = EXCLUDED.price_cents,
  emoji = EXCLUDED.emoji,
  animation_url = EXCLUDED.animation_url,
  sound_url = EXCLUDED.sound_url,
  sort_order = EXCLUDED.sort_order;


-- 3. Mettre à jour le pack premium pour inclure tous les items
UPDATE public.shop_items SET 
  pack_items = ARRAY['emote_poop','emote_fart','sound_horn','emote_clown','emote_fire','emote_wheelie','emote_crash','emote_trophy','sound_airhorn','emote_rooster','emote_laughcry','emote_mindblown']
WHERE slug = 'pack_premium_all';


-- 4. Vérification
SELECT slug, name, emoji, 
  CASE WHEN sound_url IS NOT NULL THEN '🔊' ELSE '🔇' END AS has_sound,
  CASE WHEN animation_url IS NOT NULL THEN '🎬' ELSE '—' END AS has_gif,
  price_cents || '¢' AS price
FROM public.shop_items
WHERE type != 'pack'
ORDER BY sort_order;

-- Fin V14
