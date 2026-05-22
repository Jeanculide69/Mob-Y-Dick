-- ============================================
-- V28 — Description du pneu sans mention "remerciement vidéo"
-- ============================================
-- v26 promettait un "remerciement vidéo" sur le produit sponsor_tire.
-- La team ne fait pas de vidéo perso : on retire la mention pour ne
-- pas créer une fausse attente côté acheteur.
--
-- Idempotent.
-- ============================================

UPDATE public.shop_items
  SET description = 'Sponsor d''un pneu complet pour la moto. Message custom lu à l''antenne.'
  WHERE slug = 'sponsor_tire';

SELECT 'Description sponsor_tire' AS check, slug, description
  FROM public.shop_items
  WHERE slug = 'sponsor_tire';

-- Fin V28
