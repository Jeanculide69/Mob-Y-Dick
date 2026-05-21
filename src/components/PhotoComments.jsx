import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import './PhotoComments.css';

export default function PhotoComments({ photoUrl, session, canModerate }) {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!photoUrl) return;

    // Fetch existing comments for this photo
    const fetchComments = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('photo_comments')
        .select(`
          id,
          comment,
          created_at,
          user_id,
          profiles ( display_name, avatar_url, role )
        `)
        .eq('photo_url', photoUrl)
        .order('created_at', { ascending: true });

      if (data) {
        setComments(data);
      }
      setLoading(false);
    };

    fetchComments();

    // Subscribe to new comments for this specific photo
    const channel = supabase.channel(`public:photo_comments:${photoUrl}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'photo_comments', filter: `photo_url=eq.${photoUrl}` }, async (payload) => {
        // Fetch the user profile for the new comment
        const { data: profileData } = await supabase
          .from('profiles')
          .select('display_name, avatar_url, role')
          .eq('id', payload.new.user_id)
          .single();
          
        const newCommentWithProfile = {
          ...payload.new,
          profiles: profileData
        };
        
        setComments(prev => [...prev, newCommentWithProfile]);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'photo_comments', filter: `photo_url=eq.${photoUrl}` }, (payload) => {
        setComments(prev => prev.filter(c => c.id !== payload.old.id));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [photoUrl]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || !session) return;

    const txt = newComment.trim();
    setNewComment(''); // optimistic clear
    
    await supabase.from('photo_comments').insert([{
      photo_url: photoUrl,
      user_id: session.user.id,
      comment: txt
    }]);
  };

  const handleDelete = async (commentId) => {
    if (window.confirm("Supprimer ce commentaire ?")) {
      await supabase.from('photo_comments').delete().eq('id', commentId);
    }
  };

  const hasModRights = canModerate;

  return (
    <div className="photo-comments-container">
      <h3 className="comments-title">Commentaires ({comments.length})</h3>
      
      <div className="comments-list">
        {loading ? (
          <p className="comments-muted">Chargement des commentaires...</p>
        ) : comments.length === 0 ? (
          <p className="comments-muted">Aucun commentaire pour l'instant.</p>
        ) : (
          comments.map(c => {
            const isMe = session?.user?.id === c.user_id;
            const authorRole = c.profiles?.role;
            return (
              <div key={c.id} className="comment-item">
                <img src={c.profiles?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.user_id}`} alt="avatar" className="comment-avatar" />
                <div className="comment-body">
                  <div className="comment-header">
                    <span className={`comment-author role-${authorRole}`}>{c.profiles?.display_name || 'Anonyme'}</span>
                    {authorRole === 'admin' && <span className="author-badge">👑</span>}
                    {authorRole === 'moderator' && <span className="author-badge">🛡️</span>}
                    <span className="comment-time">{new Date(c.created_at).toLocaleDateString('fr-FR')} {new Date(c.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                  </div>
                  <p className="comment-text">{c.comment}</p>
                </div>
                {(isMe || hasModRights) && (
                  <button className="comment-delete-btn" onClick={() => handleDelete(c.id)} title="Supprimer">✕</button>
                )}
              </div>
            );
          })
        )}
      </div>

      {session ? (
        <form onSubmit={handleSubmit} className="comment-form">
          <input
            type="text"
            placeholder="Écrire un commentaire..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            maxLength={300}
          />
          <button type="submit" disabled={!newComment.trim()}>Envoyer</button>
        </form>
      ) : (
        <div className="comment-login-prompt">
          Connectez-vous pour laisser un commentaire.
        </div>
      )}
    </div>
  );
}
