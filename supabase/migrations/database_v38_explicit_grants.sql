-- ============================================
-- V38 — Autorisations d'exposition de l'API des tables
-- ============================================
-- Accorde explicitement l'accès aux tables du schéma public aux rôles
-- anon, authenticated et service_role. Nécessaire pour la conformité avec
-- le changement de comportement de Supabase à partir de mai/octobre 2026.
--

-- 1. bikes
GRANT ALL ON TABLE public.bikes TO anon;
GRANT ALL ON TABLE public.bikes TO authenticated;
GRANT ALL ON TABLE public.bikes TO service_role;

-- 2. blog
GRANT ALL ON TABLE public.blog TO anon;
GRANT ALL ON TABLE public.blog TO authenticated;
GRANT ALL ON TABLE public.blog TO service_role;

-- 3. chat_messages
GRANT ALL ON TABLE public.chat_messages TO anon;
GRANT ALL ON TABLE public.chat_messages TO authenticated;
GRANT ALL ON TABLE public.chat_messages TO service_role;

-- 4. contact_messages
GRANT ALL ON TABLE public.contact_messages TO anon;
GRANT ALL ON TABLE public.contact_messages TO authenticated;
GRANT ALL ON TABLE public.contact_messages TO service_role;

-- 5. emote_triggers
GRANT ALL ON TABLE public.emote_triggers TO anon;
GRANT ALL ON TABLE public.emote_triggers TO authenticated;
GRANT ALL ON TABLE public.emote_triggers TO service_role;

-- 6. events
GRANT ALL ON TABLE public.events TO anon;
GRANT ALL ON TABLE public.events TO authenticated;
GRANT ALL ON TABLE public.events TO service_role;

-- 7. gallery
GRANT ALL ON TABLE public.gallery TO anon;
GRANT ALL ON TABLE public.gallery TO authenticated;
GRANT ALL ON TABLE public.gallery TO service_role;

-- 8. live_messages
GRANT ALL ON TABLE public.live_messages TO anon;
GRANT ALL ON TABLE public.live_messages TO authenticated;
GRANT ALL ON TABLE public.live_messages TO service_role;

-- 9. moto_affiliations
GRANT ALL ON TABLE public.moto_affiliations TO anon;
GRANT ALL ON TABLE public.moto_affiliations TO authenticated;
GRANT ALL ON TABLE public.moto_affiliations TO service_role;

-- 10. moto_profiles
GRANT ALL ON TABLE public.moto_profiles TO anon;
GRANT ALL ON TABLE public.moto_profiles TO authenticated;
GRANT ALL ON TABLE public.moto_profiles TO service_role;

-- 11. orders
GRANT ALL ON TABLE public.orders TO anon;
GRANT ALL ON TABLE public.orders TO authenticated;
GRANT ALL ON TABLE public.orders TO service_role;

-- 12. photo_comments
GRANT ALL ON TABLE public.photo_comments TO anon;
GRANT ALL ON TABLE public.photo_comments TO authenticated;
GRANT ALL ON TABLE public.photo_comments TO service_role;

-- 13. products
GRANT ALL ON TABLE public.products TO anon;
GRANT ALL ON TABLE public.products TO authenticated;
GRANT ALL ON TABLE public.products TO service_role;

-- 14. profiles
GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;

-- 15. race_announcements
GRANT ALL ON TABLE public.race_announcements TO anon;
GRANT ALL ON TABLE public.race_announcements TO authenticated;
GRANT ALL ON TABLE public.race_announcements TO service_role;

-- 16. race_laps
GRANT ALL ON TABLE public.race_laps TO anon;
GRANT ALL ON TABLE public.race_laps TO authenticated;
GRANT ALL ON TABLE public.race_laps TO service_role;

-- 17. race_sessions
GRANT ALL ON TABLE public.race_sessions TO anon;
GRANT ALL ON TABLE public.race_sessions TO authenticated;
GRANT ALL ON TABLE public.race_sessions TO service_role;

-- 18. race_teams
GRANT ALL ON TABLE public.race_teams TO anon;
GRANT ALL ON TABLE public.race_teams TO authenticated;
GRANT ALL ON TABLE public.race_teams TO service_role;

-- 19. settings
GRANT ALL ON TABLE public.settings TO anon;
GRANT ALL ON TABLE public.settings TO authenticated;
GRANT ALL ON TABLE public.settings TO service_role;

-- 20. shop_items
GRANT ALL ON TABLE public.shop_items TO anon;
GRANT ALL ON TABLE public.shop_items TO authenticated;
GRANT ALL ON TABLE public.shop_items TO service_role;

-- 21. sponsors
GRANT ALL ON TABLE public.sponsors TO anon;
GRANT ALL ON TABLE public.sponsors TO authenticated;
GRANT ALL ON TABLE public.sponsors TO service_role;

-- 22. team
GRANT ALL ON TABLE public.team TO anon;
GRANT ALL ON TABLE public.team TO authenticated;
GRANT ALL ON TABLE public.team TO service_role;

-- 23. team_announcements
GRANT ALL ON TABLE public.team_announcements TO anon;
GRANT ALL ON TABLE public.team_announcements TO authenticated;
GRANT ALL ON TABLE public.team_announcements TO service_role;

-- 24. team_chat_messages
GRANT ALL ON TABLE public.team_chat_messages TO anon;
GRANT ALL ON TABLE public.team_chat_messages TO authenticated;
GRANT ALL ON TABLE public.team_chat_messages TO service_role;

-- 25. team_members
GRANT ALL ON TABLE public.team_members TO anon;
GRANT ALL ON TABLE public.team_members TO authenticated;
GRANT ALL ON TABLE public.team_members TO service_role;

-- 26. teams
GRANT ALL ON TABLE public.teams TO anon;
GRANT ALL ON TABLE public.teams TO authenticated;
GRANT ALL ON TABLE public.teams TO service_role;

-- 27. user_purchases
GRANT ALL ON TABLE public.user_purchases TO anon;
GRANT ALL ON TABLE public.user_purchases TO authenticated;
GRANT ALL ON TABLE public.user_purchases TO service_role;

-- Fin V38
