import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Image as ImageIcon, ChevronLeft, MoreVertical, Paperclip, ShieldCheck, Clock, CheckCheck } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

interface ChatRoomProps {
  chatId: string;
  participant: any;
  currentUserId: string;
  onBack: () => void;
}

export const ChatRoom: React.FC<ChatRoomProps> = ({ chatId, participant, currentUserId, onBack }) => {
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMessages();

    const channel = supabase
      .channel(`chat:${chatId}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public',
        table: 'messages', 
        filter: `chat_id=eq.${chatId}` 
      }, (payload) => {
        setMessages(prev => [...prev, payload.new]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchMessages = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (err) {
      console.error('Error fetching messages:', err);
    } finally {
      setLoading(false);
    }
  };

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const content = newMessage.trim();
    setNewMessage('');

    try {
      const { error } = await supabase
        .from('messages')
        .insert({
          chat_id: chatId,
          sender_id: currentUserId,
          content,
          type: 'text'
        });

      if (error) throw error;
      
      await supabase
        .from('chats')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', chatId);

    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  return (
    <div className="chatroom-view-premium">
      <header className="chatroom-header-premium">
        <button className="nav-back-btn" onClick={onBack}><ChevronLeft /></button>
        
        <div className="chatroom-user-info">
           <div className="avatar-overlap">
              <img src={participant?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${participant?.username}`} alt="" />
              <div className="status-dot active" />
           </div>
           <div className="user-text">
              <div className="name-row">
                 <h4>{participant?.display_name || participant?.username}</h4>
                 {participant?.is_verified && <ShieldCheck size={14} color="var(--primary)" fill="var(--primary-light)" />}
              </div>
              <span>Online • Typical reply in 5m</span>
           </div>
        </div>

        <div className="header-actions">
           <button className="header-action-btn"><Clock size={20} /></button>
           <button className="header-action-btn"><MoreVertical size={20} /></button>
        </div>
      </header>

      <div className="messages-scroller" ref={scrollRef}>
        {loading ? (
          <div className="chat-loading-area">
             <div className="loader"></div>
          </div>
        ) : (
          <div className="messages-stack">
            <div className="chat-intro">
               <img src={participant?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${participant?.username}`} alt="" />
               <h3>This is the start of your journey with {participant?.display_name || participant?.username}</h3>
               <p>Send a message to break the ice! 🧊</p>
               <span className="date-divider">TODAY</span>
            </div>

            {messages.map((msg, idx) => {
              const isMine = msg.sender_id === currentUserId;
              const prevMsg = messages[idx-1];
              const isFirstInGroup = !prevMsg || prevMsg.sender_id !== msg.sender_id;
              
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, x: isMine ? 20 : -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`message-group ${isMine ? 'mine' : 'theirs'} ${isFirstInGroup ? 'first' : ''}`}
                >
                  <div className="message-bubble-premium">
                    <p>{msg.content}</p>
                    <div className="message-meta-sm">
                       <span>{format(new Date(msg.created_at), 'HH:mm')}</span>
                       {isMine && <CheckCheck size={12} className="read-receipt" />}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      <div className="chat-footer-premium">
         <form className="chat-input-bar-premium" onSubmit={handleSend}>
            <button type="button" className="input-action-btn"><Paperclip size={20} /></button>
            <button type="button" className="input-action-btn"><ImageIcon size={20} /></button>
            <div className="input-divider" />
            <input 
              type="text" 
              placeholder="Write something magical..." 
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
            />
            <button type="submit" className="send-action-btn" disabled={!newMessage.trim()}>
               <Send size={18} />
            </button>
         </form>
      </div>

      <style>{`
        .chatroom-view-premium { flex: 1; display: flex; flex-direction: column; background: #fff; height: 100%; border-left: 1px solid var(--border); position: relative; }
        
        .chatroom-header-premium { padding: 20px 30px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 20px; background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); z-index: 10; }
        .nav-back-btn { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--surface-alt); color: var(--text-sec); }
        
        .chatroom-user-info { flex: 1; display: flex; align-items: center; gap: 15px; }
        .avatar-overlap { position: relative; }
        .avatar-overlap img { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; border: 2px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
        .status-dot { position: absolute; bottom: 2px; right: 2px; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; }
        .status-dot.active { background: #10B981; }
        
        .user-text .name-row { display: flex; align-items: center; gap: 6px; }
        .user-text h4 { margin: 0; font-size: 16px; font-weight: 800; }
        .user-text span { font-size: 12px; color: var(--text-muted); font-weight: 600; }

        .header-actions { display: flex; gap: 5px; }
        .header-action-btn { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--text-muted); }

        .messages-scroller { flex: 1; overflow-y: auto; padding: 40px 30px; background: #F8F7FF; display: flex; flex-direction: column; scrollbar-width: none; }
        .messages-scroller::-webkit-scrollbar { display: none; }
        .messages-stack { display: flex; flex-direction: column; gap: 4px; }
        
        .chat-intro { text-align: center; padding: 40px 0 60px; color: var(--text-muted); }
        .chat-intro img { width: 80px; height: 80px; border-radius: 50%; margin-bottom: 20px; border: 4px solid white; box-shadow: 0 10px 25px rgba(0,0,0,0.1); }
        .chat-intro h3 { font-size: 18px; font-weight: 800; color: var(--text); margin-bottom: 8px; }
        .chat-intro p { font-size: 14px; margin-bottom: 30px; }
        .date-divider { font-size: 11px; font-weight: 900; letter-spacing: 2px; opacity: 0.5; position: relative; }
        .date-divider::before, .date-divider::after { content: ''; position: absolute; top: 50%; width: 50px; height: 1px; background: var(--border); }
        .date-divider::before { right: 100%; margin-right: 20px; }
        .date-divider::after { left: 100%; margin-left: 20px; }

        .message-group { display: flex; width: 100%; }
        .message-group.mine { justify-content: flex-end; }
        .message-group.theirs { justify-content: flex-start; }
        .message-group.first { margin-top: 16px; }

        .message-bubble-premium { max-width: 75%; padding: 12px 18px; border-radius: 20px; font-size: 15px; position: relative; box-shadow: 0 2px 10px rgba(0,0,0,0.03); }
        .mine .message-bubble-premium { background: var(--primary); color: white; border-bottom-right-radius: 6px; }
        .theirs .message-bubble-premium { background: white; color: var(--text); border: 1px solid var(--border); border-bottom-left-radius: 6px; }
        
        .message-meta-sm { display: flex; align-items: center; justify-content: flex-end; gap: 4px; font-size: 10px; margin-top: 4px; opacity: 0.7; }
        .read-receipt { color: #fff; }

        .chat-footer-premium { padding: 25px 30px; background: white; border-top: 1px solid var(--border); }
        .chat-input-bar-premium { display: flex; align-items: center; gap: 15px; background: var(--surface-alt); padding: 8px 8px 8px 20px; border-radius: 100px; border: 1.5px solid transparent; transition: all 0.2s; }
        .chat-input-bar-premium:focus-within { border-color: var(--primary-light); background: #fff; box-shadow: 0 0 0 4px var(--primary-light); }
        .chat-input-bar-premium input { flex: 1; border: none; background: none; outline: none; font-size: 15px; font-family: inherit; font-weight: 500; }
        
        .input-action-btn { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; color: var(--text-muted); }
        .input-divider { width: 1px; height: 24px; background: var(--border); }
        .send-action-btn { width: 42px; height: 42px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; box-shadow: 0 5px 15px rgba(124, 92, 191, 0.3); }
        .send-action-btn:disabled { opacity: 0.3; box-shadow: none; cursor: not-allowed; }
      `}</style>
    </div>
  );
};
