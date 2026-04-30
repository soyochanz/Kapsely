import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Heart, MessageCircle, UserPlus, Layers, Trash2, ShieldCheck, Clock, Archive } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface NotificationsProps {
  currentUserId: string;
}

export const Notifications: React.FC<NotificationsProps> = ({ currentUserId }) => {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotifications();
    
    // Subscribe to new notifications
    const channel = supabase
      .channel(`public:notifications:user:${currentUserId}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'notifications',
        filter: `user_id=eq.${currentUserId}`
      }, (payload) => {
        // Fetch full record to get relations
        fetchFullNotification(payload.new.id);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  const fetchFullNotification = async (id: string) => {
    const { data } = await supabase
      .from('notifications')
      .select(`
        *,
        actor:actor_id(username, avatar_url, display_name, is_verified),
        capsule:capsule_id(title)
      `)
      .eq('id', id)
      .single();
    if (data) setNotifications(prev => [data, ...prev]);
  };

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('notifications')
        .select(`
          *,
          actor:actor_id(username, avatar_url, display_name, is_verified),
          capsule:capsule_id(title)
        `)
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setNotifications(data || []);
      
      // Mark as read
      if (data && data.length > 0) {
        await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('user_id', currentUserId)
          .eq('is_read', false);
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      console.error('Error deleting notification:', err);
    }
  };

  const clearAll = async () => {
    if (!window.confirm('Clear all notifications?')) return;
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', currentUserId);
      if (error) throw error;
      setNotifications([]);
    } catch (err) {
      console.error('Error clearing notifications:', err);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'like': return <div className="icon-wrap like"><Heart size={14} fill="currentColor" /></div>;
      case 'comment': return <div className="icon-wrap comment"><MessageCircle size={14} fill="currentColor" /></div>;
      case 'follow': return <div className="icon-wrap follow"><UserPlus size={14} /></div>;
      case 'capsule_open': return <div className="icon-wrap open"><Layers size={14} /></div>;
      default: return <div className="icon-wrap default"><Bell size={14} /></div>;
    }
  };

  return (
    <div className="notifications-view-premium">
      <header className="notif-header-premium">
        <div>
           <h1>Notifications</h1>
           <p>{notifications.length} total notifications</p>
        </div>
        {notifications.length > 0 && (
          <button className="clear-btn-premium" onClick={clearAll}>
             <Archive size={16} /> Clear All
          </button>
        )}
      </header>

      {loading ? (
        <div className="notif-loading">
          <div className="loader"></div>
        </div>
      ) : (
        <div className="notif-scroll-area">
          <AnimatePresence initial={false}>
            {notifications.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="notif-empty-state"
              >
                <div className="bell-glow-icon">
                   <Bell size={48} />
                </div>
                <h3>Your inbox is empty</h3>
                <p>Interactions from the community will appear here.</p>
              </motion.div>
            ) : (
              notifications.map((notif, idx) => (
                <motion.div 
                  key={notif.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 50 }}
                  transition={{ delay: idx * 0.05 }}
                  className={`notif-card-premium ${!notif.is_read ? 'unread' : ''}`}
                >
                  <div className="notif-actor-wrap">
                    <img 
                      src={notif.actor?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${notif.actor?.username}`} 
                      className="actor-avatar-lg"
                      alt="" 
                    />
                    <div className="type-badge-overlap">{getIcon(notif.type)}</div>
                  </div>
                  
                  <div className="notif-body-premium">
                    <div className="notif-text">
                       <span className="actor-name">
                          {notif.actor?.display_name || notif.actor?.username}
                          {notif.actor?.is_verified && <ShieldCheck size={14} color="var(--primary)" fill="var(--primary-light)" />}
                       </span>
                       <span className="notif-action-text">{notif.content || 'interacted with you'}</span>
                       {notif.capsule && <span className="capsule-ref">in {notif.capsule.title}</span>}
                    </div>
                    <div className="notif-meta-row">
                       <Clock size={12} />
                       <span>{formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}</span>
                    </div>
                  </div>

                  <div className="notif-actions-premium">
                    {!notif.is_read && <div className="unread-dot" />}
                    <button 
                      className="delete-notif-action"
                      onClick={() => deleteNotification(notif.id)}
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      )}

      <style>{`
        .notifications-view-premium { width: 100%; max-width: 700px; margin: 0 auto; height: 100%; display: flex; flex-direction: column; }
        
        .notif-header-premium { display: flex; align-items: center; justify-content: space-between; padding: 40px 0; border-bottom: 1px solid var(--border); margin-bottom: 20px; }
        .notif-header-premium h1 { font-size: 28px; font-weight: 900; margin-bottom: 5px; }
        .notif-header-premium p { font-size: 14px; color: var(--text-muted); font-weight: 600; margin: 0; }
        
        .clear-btn-premium { display: flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 12px; background: white; border: 1.5px solid var(--border); color: var(--text-sec); font-weight: 800; font-size: 13px; }
        .clear-btn-premium:hover { border-color: var(--secondary); color: var(--secondary); background: #FFF5F5; }

        .notif-scroll-area { flex: 1; overflow-y: auto; padding-bottom: 100px; scrollbar-width: none; }
        .notif-scroll-area::-webkit-scrollbar { display: none; }

        .notif-card-premium { display: flex; align-items: center; gap: 20px; padding: 24px; border-radius: 28px; background: white; border: 1px solid var(--border); margin-bottom: 16px; transition: all 0.3s; position: relative; }
        .notif-card-premium:hover { transform: scale(1.01); box-shadow: 0 10px 30px rgba(124, 92, 191, 0.08); }
        .notif-card-premium.unread { background: var(--primary-light); border-color: var(--primary-light); }

        .notif-actor-wrap { position: relative; flex-shrink: 0; }
        .actor-avatar-lg { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; border: 2px solid white; box-shadow: 0 5px 15px rgba(0,0,0,0.1); }
        .type-badge-overlap { position: absolute; bottom: -2px; right: -2px; }
        
        .icon-wrap { width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; border: 2px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
        .icon-wrap.like { background: #FF4D8D; }
        .icon-wrap.comment { background: #3B82F6; }
        .icon-wrap.follow { background: #10B981; }
        .icon-wrap.open { background: #8B5CF6; }
        .icon-wrap.default { background: var(--primary); }

        .notif-body-premium { flex: 1; display: flex; flex-direction: column; gap: 6px; }
        .notif-text { font-size: 15px; line-height: 1.4; color: var(--text); }
        .actor-name { font-weight: 800; display: inline-flex; align-items: center; gap: 4px; margin-right: 6px; }
        .notif-action-text { color: var(--text-sec); font-weight: 500; }
        .capsule-ref { font-weight: 800; color: var(--primary); margin-left: 6px; }
        
        .notif-meta-row { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted); font-weight: 700; }

        .notif-actions-premium { display: flex; align-items: center; gap: 15px; }
        .unread-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--primary); box-shadow: 0 0 10px var(--primary); }
        .delete-notif-action { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: var(--text-muted); opacity: 0; transition: all 0.2s; }
        .notif-card-premium:hover .delete-notif-action { opacity: 1; }
        .delete-notif-action:hover { background: #FFF5F5; color: var(--secondary); }

        .notif-empty-state { padding: 100px 0; text-align: center; color: var(--text-muted); }
        .bell-glow-icon { width: 100px; height: 100px; border-radius: 50%; background: var(--surface-alt); display: flex; align-items: center; justify-content: center; margin: 0 auto 30px; color: var(--primary); animation: pulseBell 2s infinite; }
        @keyframes pulseBell { 0% { transform: scale(1); opacity: 0.8; } 50% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(1); opacity: 0.8; } }
        .notif-empty-state h3 { font-size: 22px; color: var(--text); margin-bottom: 10px; }
        
        .notif-loading { height: 400px; display: flex; align-items: center; justify-content: center; }
      `}</style>
    </div>
  );
};
