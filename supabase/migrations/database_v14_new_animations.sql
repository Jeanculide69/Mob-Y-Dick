-- ==========================================
-- MIGRATION V14 : NOUVELLES ANIMATIONS PREMIUM
-- Mob Y Dick — À exécuter dans Supabase SQL Editor
-- ==========================================
-- Corrige les sons (anciens étaient en 404)
-- Ajoute 7 nouvelles emotes/sons thème motocross & fun
-- ==========================================

-- 1. Corriger les sons des items existants (URLs vérifiées ✓ 200 OK)
UPDATE public.shop_items SET 
  sound_url = 'https://assets.mixkit.co/active_storage/sfx/212/212.wav',
  animation_url = 'https://media.giphy.com/media/3o7TKNdE3FMxMx0dVe/giphy.gif'
WHERE slug = 'emote_poop';

UPDATE public.shop_items SET 
  sound_url = 'https://assets.mixkit.co/active_storage/sfx/2617/2617.wav',
  animation_url = 'https://media.giphy.com/media/xT5LMQ8rHYTDGFG07e/giphy.gif'
WHERE slug = 'emote_fart';

UPDATE public.shop_items SET 
  sound_url = 'https://assets.mixkit.co/active_storage/sfx/2018/2018.wav'
WHERE slug = 'sound_horn';

UPDATE public.shop_items SET 
  sound_url = 'https://assets.mixkit.co/active_storage/sfx/2955/2955.wav',
  animation_url = 'https://media.giphy.com/media/x0npYExCGOZeo/giphy.gif'
WHERE slug = 'emote_clown';

UPDATE public.shop_items SET 
  sound_url = 'https://assets.mixkit.co/active_storage/sfx/234/234.wav',
  animation_url = 'https://media.giphy.com/media/Lopx9eUi34rbq/giphy.gif'
WHERE slug = 'emote_fire';


-- 2. Ajouter les nouvelles animations (toutes URLs vérifiées ✓ 200 OK)
INSERT INTO public.shop_items (slug, name, description, type, price_cents, emoji, animation_url, sound_url, sort_order)
VALUES 
  ('emote_wheelie', '🏍️ Wheelie de Folie', 'Une moto qui fait un wheelie épique sur le live !', 'emote_sound', 300, '🏍️', 'https://media.giphy.com/media/37lUupgTHHm2Q/giphy.gif', 'https://assets.mixkit.co/active_storage/sfx/558/558.wav', 6),
  ('emote_crash', '💥 Crash Spectaculaire', 'BOOM ! Une gamelle mémorable qui fait rire tout le monde.', 'emote_sound', 200, '💥', 'https://media.giphy.com/media/3ohhwvcRk2NDL7fKsE/giphy.gif', 'https://assets.mixkit.co/active_storage/sfx/1630/1630.wav', 7),
  ('emote_trophy', '🏆 Champion du Monde', 'Célèbre la victoire avec une pluie de confettis et une coupe géante !', 'emote_sound', 300, '🏆', 'https://media.giphy.com/media/g9582DNuQppxC/giphy.gif', 'https://cdn.freesound.org/previews/270/270402_5123851-lq.mp3', 8),
  ('sound_airhorn', '📣 Air Horn de Stade', 'Le fameux coup de corne de brume qui réveille tout le circuit !', 'sound', 200, '📣', NULL, 'https://assets.mixkit.co/active_storage/sfx/2003/2003.wav', 9),
  ('emote_rooster', '🐔 Rooster Tail', 'Envoie un énorme jet de boue sur tout le live !', 'emote_sound', 200, '🐔', 'https://media.giphy.com/media/MBrwSn16nlfP02BJ1A/giphy.gif', 'https://assets.mixkit.co/active_storage/sfx/2401/2401.wav', 10),
  ('emote_laughcry', '🤣 Mort de Rire', 'Explose de rire avec un éclat de rire contagieux en plein live !', 'emote_sound', 200, '🤣', 'https://media.giphy.com/media/10JhviFuU2gWD6/giphy.gif', 'https://assets.mixkit.co/active_storage/sfx/253/253.wav', 11),
  ('emote_mindblown', '🤯 Mind Blown', 'Quand un passage est tellement rapide que ton cerveau explose.', 'emote_sound', 300, '🤯', 'https://media.giphy.com/media/xT0xeJpnrWC3XWblEk/giphy.gif', 'https://assets.mixkit.co/active_storage/sfx/2658/2658.wav', 12)
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
