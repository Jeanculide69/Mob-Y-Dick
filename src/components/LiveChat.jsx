import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import './LiveChat.css';

/**
 * LiveChat — Chat global + chat team(s) avec onglets
 *
 * Contexte = 'global' (table chat_messages, lecture publique) OU un team_id
 * (table team_chat_messages, RLS team-only).
 *
 * Sécurité team : tout est filtré par RLS Supabase. Si l'utilisateur perd
 * l'accès à une team, la subscription échoue silencieusement et SELECT
 * retourne 0 lignes — pas de fuite côté client.
 */
export default function LiveChat({ session, canModerate }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [teams, setTeams] = useState([]);
  const [activeContext, setActiveContext] = useState('global'); // 'global' | team_id
  const isOpenRef = useRef(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    isOpenRef.current = isOpen;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isOpen) setUnreadCount(0);
  }, [isOpen]);

  // ── Charge la liste des teams de l'utilisateur (pour les onglets) ──
  useEffect(() => {
    if (!session) {
      setTeams([]);
      return;
    }
    supabase.from('teams')
      .select('id, name')
      .order('created_at', { ascending: false })
      .then(({ data }) => setTeams(data || []));
  }, [session?.user?.id]);

  // ── Fetch + subscribe selon le contexte actif ──
  // Chat global → chat_messages seul.
  // Chat team   → team_chat_messages + team_announcements (fusionnées par
  //               created_at, distinguées par msg.kind = 'message' | 'announcement').
  useEffect(() => {
    let cancelled = false;
    const isGlobal = activeContext === 'global';

    const fetchMessages = async () => {
      if (isGlobal) {
        const { data } = await supabase
          .from('chat_messages')
          .select('id, message, created_at, user_id, profiles ( display_name, avatar_url, role )')
          .order('created_at', { ascending: false })
          .limit(50);
        if (!cancelled && data) setMessages(data.reverse().map(m => ({ ...m, kind: 'message' })));
      } else {
        const [chatRes, annRes] = await Promise.all([
          supabase
            .from('team_chat_messages')
            .select('id, message, created_at, user_id, team_id, profiles ( display_name, avatar_url, role )')
            .eq('team_id', activeContext)
            .order('created_at', { ascending: false })
            .limit(50),
          supabase
            .from('team_announcements')
            .select('id, message, created_at, created_by, team_id, profiles:created_by ( display_name, avatar_url, role )')
            .eq('team_id', activeContext)
            .order('created_at', { ascending: false })
            .limit(50),
        ]);
        const chats = (chatRes.data || []).map(m => ({ ...m, kind: 'message' }));
        const anns  = (annRes.data || []).map(a => ({ ...a, kind: 'announcement', user_id: a.created_by }));
        const merged = [...chats, ...anns].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        if (!cancelled) setMessages(merged);
      }
    };
    fetchMessages();

    const channelName = isGlobal ? 'public:chat_messages' : `team:${activeContext}:feed`;
    const filter = isGlobal ? undefined : `team_id=eq.${activeContext}`;
    const channel = supabase.channel(channelName);

    // Helper : push un nouvel item dans messages en respectant l'ordre chrono
    const pushItem = (item) => {
      if (cancelled) return;
      setMessages(prev => {
        if (prev.some(m => m.kind === item.kind && m.id === item.id)) return prev;
        const next = [...prev, item];
        return next.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      });
      if (!isOpenRef.current) setUnreadCount(c => c + 1);
    };

    const chatTable = isGlobal ? 'chat_messages' : 'team_chat_messages';

    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: chatTable, ...(filter ? { filter } : {}) }, async (payload) => {
      const { data: profileData } = await supabase
        .from('profiles').select('display_name, avatar_url, role')
        .eq('id', payload.new.user_id).maybeSingle();
      pushItem({ ...payload.new, profiles: profileData, kind: 'message' });
    });
    channel.on('postgres_changes', { event: 'DELETE', schema: 'public', table: chatTable, ...(filter ? { filter } : {}) }, (payload) => {
      if (cancelled) return;
      setMessages(prev => prev.filter(m => !(m.kind === 'message' && m.id === payload.old.id)));
    });

    // En contexte team, écouter aussi les annonces team (RLS filtre)
    if (!isGlobal) {
      channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_announcements', filter: `team_id=eq.${activeContext}` }, async (payload) => {
        const { data: profileData } = await supabase
          .from('profiles').select('display_name, avatar_url, role')
          .eq('id', payload.new.created_by).maybeSingle();
        pushItem({ ...payload.new, profiles: profileData, kind: 'announcement', user_id: payload.new.created_by });
      });
    }

    channel.subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [activeContext]);

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
    if (activeContext === 'global') {
      await supabase.from('chat_messages').insert([{ user_id: session.user.id, message: msg }]);
    } else {
      await supabase.from('team_chat_messages').insert([{
        user_id: session.user.id,
        message: msg,
        team_id: activeContext
      }]);
    }
  };

  const handleDeleteMessage = async (msgId) => {
    if (!window.confirm('Supprimer ce message ?')) return;
    const table = activeContext === 'global' ? 'chat_messages' : 'team_chat_messages';
    await supabase.from(table).delete().eq('id', msgId);
  };

  const hasModRights = canModerate && activeContext === 'global'; // les mods ne modèrent QUE le chat global

  const activeTeamName = activeContext === 'global'
    ? null
    : teams.find(t => t.id === activeContext)?.name;

  return (
    <div className={`live-chat-container${isOpen ? ' is-open' : ''}`}>
      {isOpen && (
        <div className="chat-window glass">
          <div className="chat-header">
            <h3>💬 Chat {activeContext === 'global' ? 'global' : `— ${activeTeamName || 'Team'}`}</h3>
            <button className="chat-close" onClick={() => setIsOpen(false)} aria-label="Réduire le chat">
              —
            </button>
          </div>

          {teams.length > 0 && (
            <div className="chat-tabs">
              <button
                type="button"
                className={`chat-tab ${activeContext === 'global' ? 'active' : ''}`}
                onClick={() => setActiveContext('global')}
              >
                🌐 Global
              </button>
              <button
                type="button"
                className={`chat-tab ${activeContext === teams[0].id ? 'active' : ''}`}
                onClick={() => setActiveContext(teams[0].id)}
                title={teams[0].name}
              >
                👥 {teams[0].name}
              </button>
            </div>
          )}

          <div className="chat-messages">
            {messages.length === 0 ? (
              <p className="no-messages">
                {activeContext === 'global'
                  ? "Aucun message pour l'instant. Soyez le premier !"
                  : "Aucun message dans cette team. Lance la conversation !"}
              </p>
            ) : (
              messages.map((msg) => {
                const isMe = session?.user?.id === msg.user_id;
                const authorRole = msg.profiles?.role;
                const isAnnouncement = msg.kind === 'announcement';

                if (isAnnouncement) {
                  return (
                    <div key={`ann-${msg.id}`} className="chat-announcement">
                      <div className="chat-announcement-header">
                        <span className="chat-announcement-icon">📣</span>
                        <span className="chat-announcement-label">Annonce team</span>
                        <span className="chat-announcement-time">
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="chat-announcement-body">
                        <strong>{msg.profiles?.display_name || 'Membre'}</strong> : {msg.message}
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={`msg-${msg.id}`} className={`chat-msg ${isMe ? 'msg-me' : 'msg-other'}`}>
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
                placeholder={activeContext === 'global' ? 'Votre message...' : `Message à ${activeTeamName || 'la team'}...`}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                maxLength={activeContext === 'global' ? 200 : 500}
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
