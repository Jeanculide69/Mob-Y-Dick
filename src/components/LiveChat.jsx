import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import './LiveChat.css';

export default function LiveChat({ session, isAdmin, isModerator }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const isOpenRef = useRef(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    isOpenRef.current = isOpen;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isOpen) setUnreadCount(0);
  }, [isOpen]);

  useEffect(() => {
    const fetchMessages = async () => {
      const { data } = await supabase
        .from('chat_messages')
        .select(`id, message, created_at, user_id, profiles ( display_name, avatar_url, role )`)
        .order('created_at', { ascending: false })
        .limit(50);
      if (data) setMessages(data.reverse());
    };
    fetchMessages();

    const channel = supabase.channel('public:chat_messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, async (payload) => {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('display_name, avatar_url, role')
          .eq('id', payload.new.user_id)
          .single();
        const newMsg = { ...payload.new, profiles: profileData };
        setMessages(prev => [...prev, newMsg]);
        if (!isOpenRef.current) {
          setUnreadCount(c => c + 1);
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages' }, (payload) => {
        setMessages(prev => prev.filter(msg => msg.id !== payload.old.id));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 120);
    }
  }, [messages, isOpen]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !session) return;
    const msg = newMessage.trim();
    setNewMessage('');
    await supabase.from('chat_messages').insert([{ user_id: session.user.id, message: msg }]);
  };

  const handleDeleteMessage = async (msgId) => {
    if (window.confirm('Supprimer ce message ?')) {
      await supabase.from('chat_messages').delete().eq('id', msgId);
    }
  };

  const hasModRights = isAdmin || isModerator;

  return (
    <div className={`live-chat-container${isOpen ? ' is-open' : ''}`}>
      {isOpen && (
        <div className="chat-window glass">
          <div className="chat-header">
            <h3>💬 Chat en direct</h3>
            <button className="chat-close" onClick={() => setIsOpen(false)} aria-label="Réduire le chat">
              —
            </button>
          </div>

          <div className="chat-messages">
            {messages.length === 0 ? (
              <p className="no-messages">Aucun message pour l'instant. Soyez le premier !</p>
            ) : (
              messages.map((msg) => {
                const isMe = session?.user?.id === msg.user_id;
                const authorRole = msg.profiles?.role;
                return (
                  <div key={msg.id} className={`chat-msg ${isMe ? 'msg-me' : 'msg-other'}`}>
                    <img
                      src={msg.profiles?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.user_id}`}
                      alt="avatar"
                      className="chat-avatar"
                      loading="lazy"
                    />
                    <div className="msg-content-wrapper">
                      <div className="msg-author">
                        <span className={`author-name role-${authorRole}`}>
                          {msg.profiles?.display_name || 'Rider Anonyme'}
                        </span>
                        {authorRole === 'admin' && <span className="author-badge">👑</span>}
                        {authorRole === 'moderator' && <span className="author-badge">🛡️</span>}
                      </div>
                      <div className="msg-bubble">
                        <p>{msg.message}</p>
                        <span className="msg-time">
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                    {hasModRights && !isMe && (
                      <button className="msg-delete-btn" onClick={() => handleDeleteMessage(msg.id)}>🗑️</button>
                    )}
                    {isMe && (
                      <button className="msg-delete-btn my-delete-btn" onClick={() => handleDeleteMessage(msg.id)}>🗑️</button>
                    )}
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {session ? (
            <form onSubmit={handleSendMessage} className="chat-input-form">
              <input
                type="text"
                placeholder="Votre message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                maxLength={200}
              />
              <button type="submit" disabled={!newMessage.trim()}>Envoyer</button>
            </form>
          ) : (
            <div className="chat-login-prompt">
              Connectez-vous pour participer au chat.
            </div>
          )}
        </div>
      )}

      <button
        className={`chat-toggle-btn${isOpen ? ' active' : ''}`}
        onClick={() => setIsOpen(o => !o)}
        aria-label={isOpen ? 'Réduire le chat' : 'Ouvrir le chat'}
      >
        <span className="chat-btn-icon">{isOpen ? '✕' : '💬'}</span>
        <span className="chat-btn-label">{isOpen ? 'Réduire' : 'Chat'}</span>
        {!isOpen && unreadCount > 0 && (
          <span className="chat-unread-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>
    </div>
  );
}
