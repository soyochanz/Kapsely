import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Search, ShieldCheck, Edit, Plus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ChatListProps {
  onSelectChat: (chatId: string, participant: any) => void;
  currentUserId: string;
}

export const ChatList: React.FC<ChatListProps> = ({ onSelectChat, currentUserId }) => {
  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchChats();

    const subscription = supabase
      .channel('chat_list_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        fetchChats();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchChats = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_chat_list_data');

      if (error) throw error;

      const processedChats = (data?.chats || []).map((chat: any) => ({
        id: chat.conversation_id,
        conversation_id: chat.conversation_id,
        updated_at: chat.sort_at,
        otherParticipant: chat.other_user,
        lastMsg: chat.last_message,
        unread_count: chat.unread_count,
        is_read: Number(chat.unread_count || 0) === 0
      }));

      setChats(processedChats);
    } catch (err) {
      console.error('Error fetching chats:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredChats = chats.filter(chat => 
    chat.otherParticipant.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (chat.otherParticipant.display_name && chat.otherParticipant.display_name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="chatlist-view-premium">
      <header className="chatlist-header-premium">
         <div className="header-top-row">
            <h1>Inbox</h1>
            <button className="new-chat-btn"><Edit size={18} /></button>
         </div>
         <div className="chat-search-premium">
            <Search size={18} />
            <input 
              type="text" 
              placeholder="Search conversations..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
         </div>
      </header>

      <div className="chat-items-area">
        {loading && chats.length === 0 ? (
          <div className="chatlist-loading">
             <div className="loader"></div>
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="chatlist-empty">
             <div className="empty-icon-wrap"><MessageSquare size={48} /></div>
             <h3>No messages found</h3>
             <p>Start a new conversation to begin your journey.</p>
             <button className="primary-btn-sm" style={{marginTop: '20px'}}>New Message</button>
          </div>
        ) : (
          <div className="chat-list-stack">
            {filteredChats.map((chat, idx) => (
              <motion.div
                key={chat.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="chat-item-premium"
                onClick={() => onSelectChat(chat.id, chat.otherParticipant)}
              >
                <div className="chat-item-avatar-wrap">
                  <img 
                    src={chat.otherParticipant?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${chat.otherParticipant?.username}`} 
                    alt="" 
                  />
                  <div className="active-ring" />
                </div>
                
                <div className="chat-item-content">
                  <div className="chat-item-top">
                    <div className="chat-item-name">
                       <strong>{chat.otherParticipant?.display_name || chat.otherParticipant?.username}</strong>
                       {chat.otherParticipant?.is_verified && <ShieldCheck size={14} color="var(--primary)" fill="var(--primary-light)" />}
                    </div>
                    <span className="chat-item-time">
                      {chat.lastMsg ? formatDistanceToNow(new Date(chat.lastMsg.created_at), { addSuffix: false }) : ''}
                    </span>
                  </div>
                  
                  <div className="chat-item-bottom">
                    <p className="chat-item-preview">
                      {chat.lastMsg?.content || 'Started a conversation'}
                    </p>
                    {chat.unread_count > 0 && <div className="unread-indicator" />}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        .chatlist-view-premium { width: 400px; height: 100%; border-right: 1px solid var(--border); display: flex; flex-direction: column; background: white; z-index: 5; }
        
        .chatlist-header-premium { padding: 40px 30px 30px; border-bottom: 1px solid var(--border); }
        .header-top-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 25px; }
        .header-top-row h1 { font-size: 24px; font-weight: 900; }
        .new-chat-btn { width: 40px; height: 40px; border-radius: 50%; background: var(--surface-alt); display: flex; align-items: center; justify-content: center; color: var(--text); }
        
        .chat-search-premium { display: flex; align-items: center; gap: 12px; background: var(--surface-alt); padding: 12px 20px; border-radius: 16px; border: 1.5px solid transparent; transition: all 0.2s; }
        .chat-search-premium:focus-within { background: white; border-color: var(--primary); box-shadow: 0 4px 15px rgba(124, 92, 191, 0.1); }
        .chat-search-premium input { flex: 1; border: none; background: none; outline: none; font-size: 14px; font-weight: 600; font-family: inherit; }
        .chat-search-premium color { color: var(--text-muted); }

        .chat-items-area { flex: 1; overflow-y: auto; scrollbar-width: none; }
        .chat-items-area::-webkit-scrollbar { display: none; }
        
        .chat-item-premium { display: flex; align-items: center; gap: 15px; padding: 18px 30px; cursor: pointer; transition: all 0.2s; border-bottom: 1px solid #f9f9f9; }
        .chat-item-premium:hover { background: #fcfbff; }
        .chat-item-premium:active { background: var(--primary-light); }
        
        .chat-item-avatar-wrap { position: relative; flex-shrink: 0; }
        .chat-item-avatar-wrap img { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; border: 2px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
        .active-ring { position: absolute; bottom: 2px; right: 2px; width: 14px; height: 14px; background: #10B981; border: 2.5px solid white; border-radius: 50%; }

        .chat-item-content { flex: 1; min-width: 0; }
        .chat-item-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
        .chat-item-name { display: flex; align-items: center; gap: 6px; }
        .chat-item-name strong { font-size: 15px; font-weight: 800; color: var(--text); }
        .chat-item-time { font-size: 12px; color: var(--text-muted); font-weight: 600; }

        .chat-item-bottom { display: flex; justify-content: space-between; align-items: center; }
        .chat-item-preview { margin: 0; font-size: 14px; color: var(--text-sec); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
        .unread-indicator { width: 10px; height: 10px; background: var(--primary); border-radius: 50%; margin-left: 10px; }

        .chatlist-empty { padding: 80px 40px; text-align: center; color: var(--text-muted); }
        .empty-icon-wrap { width: 80px; height: 80px; border-radius: 50%; background: var(--surface-alt); display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; color: var(--primary); }
        .chatlist-empty h3 { font-size: 20px; color: var(--text); margin-bottom: 10px; }
        .chatlist-empty p { font-size: 14px; }
        
        .chatlist-loading { height: 300px; display: flex; align-items: center; justify-content: center; }
      `}</style>
    </div>
  );
};
