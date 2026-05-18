-- ==========================================
-- SCRIPT D'INSTALLATION SUPABASE (MOB Y DICK)
-- ==========================================

-- 1. Table des profils utilisateurs (lié à l'authentification)
CREATE TABLE public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  email text,
  display_name text,
  avatar_url text,
  role text default 'user' check (role in ('user', 'moderator', 'admin')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Active RLS sur profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Les profils sont publics à la lecture
CREATE POLICY "Les profils sont visibles par tout le monde." ON public.profiles
  FOR SELECT USING (true);

-- Un utilisateur peut modifier son propre profil
CREATE POLICY "Les utilisateurs peuvent modifier leur profil." ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Un administrateur peut modifier n'importe quel profil (pour changer les rôles)
CREATE POLICY "Les admins peuvent modifier les profils." ON public.profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ==========================================
-- 2. Trigger pour créer automatiquement un profil à l'inscription
-- ==========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'avatar_url', 'https://api.dicebear.com/7.x/avataaars/svg?seed=' || new.email),
    'user'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Exécution du trigger à chaque nouvel utilisateur
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ==========================================
-- 3. Table du Chat en direct
-- ==========================================
CREATE TABLE public.chat_messages (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  message text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Active RLS sur chat_messages
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Lecture publique (tout le monde peut lire le chat)
CREATE POLICY "Tout le monde peut lire le chat." ON public.chat_messages
  FOR SELECT USING (true);

-- Seuls les utilisateurs connectés peuvent écrire
CREATE POLICY "Les utilisateurs connectés peuvent écrire dans le chat." ON public.chat_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Seuls l'auteur, un admin ou un modérateur peut supprimer un message
CREATE POLICY "Suppression par auteur ou modo." ON public.chat_messages
  FOR DELETE USING (
    auth.uid() = user_id OR 
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
  );

-- ==========================================
-- 4. Table des Commentaires Photos
-- ==========================================
CREATE TABLE public.photo_comments (
  id uuid default gen_random_uuid() primary key,
  photo_url text not null, -- L'URL ou l'ID de la photo commentée
  user_id uuid references public.profiles(id) on delete cascade not null,
  comment text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Active RLS sur photo_comments
ALTER TABLE public.photo_comments ENABLE ROW LEVEL SECURITY;

-- Lecture publique
CREATE POLICY "Tout le monde peut lire les commentaires." ON public.photo_comments
  FOR SELECT USING (true);

-- Écriture si connecté
CREATE POLICY "Les utilisateurs connectés peuvent commenter." ON public.photo_comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Suppression par auteur, admin ou modo
CREATE POLICY "Suppression de commentaires par auteur ou modo." ON public.photo_comments
  FOR DELETE USING (
    auth.uid() = user_id OR 
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
  );

-- ==========================================
-- 5. Activer le Temps Réel (Realtime)
-- ==========================================
-- Nécessaire pour que le chat se mette à jour sans rafraîchir
begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime;
commit;
alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.photo_comments;

-- ==========================================
-- 6. Lier les commandes aux utilisateurs
-- ==========================================
-- Ajoutez cette colonne si la table orders existe déjà
-- ALTER TABLE public.orders ADD COLUMN user_id uuid references public.profiles(id);
