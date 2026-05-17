import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, Lock, Users, MessageSquare, Heart, Plus, Clock, Send, ShieldCheck, ChevronDown, Share2, Unlock, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { supabase } from '../lib/supabase';
import { getModelImage, getModelImageOpen, getModelTint } from '../constants/models';
import { AddItem } from './AddItem';
import CapsuleWithTimer from './CapsuleWithTimer';

interface CapsuleDetailProps {
  capsule: any;
  onClose: () => void;
}

export const CapsuleDetail: React.FC<CapsuleDetailProps> = ({ capsule: initialCapsule, onClose }) => {
  const [capsule, setCapsule] = useState(initialCapsule);
  const [items, setItems] = useState<any[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState<any[]>([]);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(initialCapsule.likes_count || 0);
  const [showAddItem, setShowAddItem] = useState(false);
  const [activeTab, setActiveTab] = useState<'content' | 'chat'>('content');
  const [userId, setUserId] = useState<string | null>(null);
  
  const [commentsPage, setCommentsPage] = useState(0);
  const [hasMoreComments, setHasMoreComments] = useState(true);
  const [loadingComments, setLoadingComments] = useState(false);
  const COMMENTS_PAGE_SIZE = 6;

  const [timeLeft, setTimeLeft] = useState<string>('');
  const [isOpening, setIsOpening] = useState(false);
  const [showUnsealAnim, setShowUnsealAnim] = useState(false);

  const isOwner = userId === capsule.owner_id;
  const isSealed = capsule.status === 'sealed';
  const isClosed = isSealed;
  const canBeOpened = useMemo(() => {
    if (!capsule.opens_at) return true;
    return new Date(capsule.opens_at) <= new Date();
  }, [capsule.opens_at]);

  useEffect(() => {
    const getAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id || null);
    };
    getAuth();
  }, []);

  useEffect(() => {
    fetchItems();
    fetchComments(0, true);
    checkIfLiked();
  }, [capsule.id]);

  useEffect(() => {
    if (!isSealed) return;
    const updateTimer = () => {
      const target = new Date(capsule.opens_at);
      const now = new Date();
      if (target <= now) {
        setTimeLeft('READY');
        return;
      }
      setTimeLeft(formatDistanceToNow(target, { addSuffix: true }));
    };
    updateTimer();
    const interval = setInterval(updateTimer, 60000);
    return () => clearInterval(interval);
  }, [capsule.opens_at, isSealed]);

  const fetchItems = async () => {
    try {
      setLoadingItems(true);
      const { data, error } = await supabase
        .from('capsule_items')
        .select('*, profiles:owner_id(username, avatar_url, display_name)')
        .eq('capsule_id', capsule.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setItems(data || []);
    } catch (err) {
      console.error('Error fetching items:', err);
    } finally {
      setLoadingItems(false);
    }
  };

  const fetchComments = async (page: number, isRefresh = false) => {
    try {
      setLoadingComments(true);
      const { data, error } = await supabase
        .from('capsule_comments')
        .select('*, profiles:user_id(username, avatar_url, display_name, is_verified)')
        .eq('capsule_id', capsule.id)
        .order('created_at', { ascending: false })
        .range(page * COMMENTS_PAGE_SIZE, (page + 1) * COMMENTS_PAGE_SIZE - 1);

      if (error) throw error;
      
      if (isRefresh) setComments(data || []);
      else setComments(prev => [...prev, ...(data || [])]);
      
      setHasMoreComments(data?.length === COMMENTS_PAGE_SIZE);
    } catch (err) {
      console.error('Error fetching comments:', err);
    } finally {
      setLoadingComments(false);
    }
  };

  const handleLoadMoreComments = () => {
    const nextPage = commentsPage + 1;
    fetchComments(nextPage);
    setCommentsPage(nextPage);
  };

  const checkIfLiked = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('likes')
      .select('id')
      .eq('capsule_id', capsule.id)
      .eq('user_id', user.id)
      .maybeSingle();
    setIsLiked(!!data);
  };

  const handleLike = async () => {
    if (!userId) return;

    const wasLiked = isLiked;
    setIsLiked(!wasLiked);
    setLikeCount(prev => wasLiked ? prev - 1 : prev + 1);

    try {
      if (wasLiked) {
        await supabase.from('likes').delete().eq('capsule_id', capsule.id).eq('user_id', userId);
      } else {
        await supabase.from('likes').insert({ capsule_id: capsule.id, user_id: userId });
      }
    } catch (err) {
      setIsLiked(wasLiked);
      setLikeCount(prev => wasLiked ? prev + 1 : prev - 1);
    }
  };

  const handleSendComment = async () => {
    if (!comment.trim() || !userId) return;

    const text = comment.trim();
    setComment('');

    try {
      const { data, error } = await supabase
        .from('capsule_comments')
        .insert({
          capsule_id: capsule.id,
          user_id: userId,
          content: text
        })
        .select('*, profiles:user_id(username, avatar_url, display_name, is_verified)')
        .single();

      if (error) throw error;
      setComments(prev => [data, ...prev]);
    } catch (err) {
      console.error('Error sending comment:', err);
    }
  };

  const handleUnseal = async () => {
    if (!canBeOpened || isOpening) return;
    setIsOpening(true);
    setShowUnsealAnim(true);
    
    // Simulate animation duration
    setTimeout(async () => {
      try {
        const { error } = await supabase
          .from('capsules')
          .update({ status: 'opened' })
          .eq('id', capsule.id);
        
        if (error) throw error;
        setCapsule({ ...capsule, status: 'opened' });
        setShowUnsealAnim(false);
        setIsOpening(false);
      } catch (err) {
        console.error('Error unsealing:', err);
        setShowUnsealAnim(false);
        setIsOpening(false);
      }
    }, 4000);
  };

  const handleShare = () => {
     const url = `https://kapsely.com/capsule/${capsule.id}`;
     navigator.clipboard.writeText(url);
     alert('Link copied to clipboard!');
  };

  const tintColor = getModelTint(capsule.model);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="modal-overlay"
      onClick={onClose}
    >
      <motion.div 
        initial={{ y: 100, scale: 0.95, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 100, scale: 0.95, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="modal-content glass-card capsule-detail-modal"
        onClick={e => e.stopPropagation()}
      >
        <div className="detail-layout">
          {/* Left Side: Visual Content */}
          <div className="detail-media-pane" style={{'--accent': tintColor} as any}>
            <AnimatePresence mode="wait">
              {showUnsealAnim ? (
                <motion.div 
                  key="unseal-anim"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="epic-unseal-overlay"
                >
                   <div className="energy-rings">
                      <div className="ring ring-1" />
                      <div className="ring ring-2" />
                      <div className="ring ring-3" />
                   </div>
                   <motion.img 
                     src={getModelImage(capsule.model)}
                     animate={{ 
                       scale: [1, 1.2, 0.8, 1.5],
                       rotate: [0, 5, -5, 0],
                       filter: ['brightness(1)', 'brightness(2)', 'brightness(1)']
                     }}
                     transition={{ duration: 4, ease: "easeInOut" }}
                     className="unseal-hero-img"
                   />
                   <motion.div 
                     initial={{ opacity: 0, scale: 0.5 }}
                     animate={{ opacity: 1, scale: 1.2 }}
                     className="burst-glow" 
                   />
                   <h2>RELEASING MEMORIES</h2>
                </motion.div>
              ) : isSealed ? (
                <motion.div 
                  key="sealed-view"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="sealed-hero-view"
                >
                   <div className="sealed-background-glow" />
                    <div className="hero-model-container" style={{ position: 'relative', width: '100%', height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onContextMenu={e => e.preventDefault()}>
                        {/* Sealed web view never renders protected media URLs. */}
                        {isClosed && (capsule.cover_url || (capsule.collage_items?.length > 0)) && (
                          <div className="sealed-content-blur-container" style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
                              <div className="secure-locked-art" />
                              <div className="security-overlay" />
                          </div>
                        )}

                        <div style={{ 
                          position: 'relative', 
                          zIndex: 2,
                          width: (capsule.cover_url || (capsule.collage_items?.length > 0)) ? '160px' : '320px',
                          height: (capsule.cover_url || (capsule.collage_items?.length > 0)) ? '160px' : '320px',
                          transition: 'all 0.5s ease',
                          transform: (capsule.cover_url || (capsule.collage_items?.length > 0)) ? 'translate(80px, 80px)' : 'none'
                        }}>
                          <CapsuleWithTimer 
                            modelKey={capsule.model}
                            source={getModelImage(capsule.model)}
                            date={capsule.opens_at}
                            modelLayout={capsule.model_snapshot}
                            chainId={capsule.chain_id}
                            style={{ width: '100%', height: '100%' }}
                            isOpened={false}
                          />
                        </div>
                    </div>
                      
                      <div className="sealed-timer-card">
                         <div className="timer-header">
                            <Clock size={18} />
                            <span>TIME REMAINING</span>
                         </div>
                         <div className="timer-value">{timeLeft || 'CALCULATING...'}</div>
                         <p className="timer-hint">Content is blurred until the seal breaks.</p>
                      </div>

                      {isOwner && canBeOpened && (
                        <motion.button 
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="unseal-action-btn"
                          onClick={handleUnseal}
                        >
                          <Unlock size={20} /> BREAK SEAL
                        </motion.button>
                      )}
                </motion.div>
              ) : (
                <motion.div 
                  key="opened-view"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="opened-hero-view"
                >
                   <div className="opened-hero-top">
                      <CapsuleWithTimer 
                        modelKey={capsule.model}
                        source={getModelImageOpen(capsule.model)}
                        date={capsule.opens_at}
                        modelLayout={capsule.model_snapshot}
                        chainId={capsule.chain_id}
                        style={{ width: 220, height: 220 }}
                        isOpened={true}
                        disableAnimations={true}
                      />
                   </div>
                   <div className="items-masonry-web">
                      {items.length === 0 ? (
                        <div className="empty-capsule-state">
                           <ImageIcon size={48} />
                           <h3>Nothing here yet</h3>
                           <p>Be the first to contribute to this capsule.</p>
                        </div>
                      ) : (
                        items.map((item, idx) => (
                          <motion.div 
                            key={item.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            className="item-card-premium"
                          >
                            {item.media_type === 'image' ? (
                              <img src={item.media_url} alt="" className="item-img" />
                            ) : (
                              <div className="item-note-lg">
                                 <p>{item.content}</p>
                              </div>
                            )}
                            <div className="item-footer-sm">
                               <img src={item.profiles?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.profiles?.username}`} alt="" />
                               <span>{item.profiles?.display_name || item.profiles?.username}</span>
                            </div>
                          </motion.div>
                        ))
                      )}

                      <button className="add-item-card-dashed" onClick={() => setShowAddItem(true)}>
                         <Plus size={32} />
                         <span>Add Memory</span>
                      </button>
                   </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right Side: Info & Interaction */}
          <div className="detail-sidebar-pane">
             <div className="sidebar-header-premium">
                <div className="user-info-row">
                   <img src={capsule.profiles?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${capsule.profiles?.username}`} alt="" className="author-avatar" />
                   <div className="author-names">
                      <div className="display-name-wrap">
                         <h4>{capsule.profiles?.display_name || capsule.profiles?.username}</h4>
                         {capsule.profiles?.is_verified && <ShieldCheck size={16} color="var(--primary)" fill="var(--primary-light)" />}
                      </div>
                      <p>@{capsule.profiles?.username}</p>
                   </div>
                   <button className="close-x-btn" onClick={onClose}><X /></button>
                </div>
                
                <div className="detail-meta-premium">
                   <h2 className="capsule-title-lg">{capsule.title}</h2>
                   <p className="capsule-description-lg">{capsule.description || "A beautiful collection of memories preserved for the future."}</p>
                   
                   <div className="stats-row-premium">
                      <div className="stat-pill-sm">
                         <Calendar size={14} />
                         <span>{format(new Date(capsule.created_at), 'MMM d, yyyy')}</span>
                      </div>
                      <div className="stat-pill-sm">
                         <Users size={14} />
                         <span>{capsule.participants_count || 1} members</span>
                      </div>
                      <button className="share-btn-pill" onClick={handleShare}>
                         <Share2 size={14} />
                         <span>Share</span>
                      </button>
                   </div>
                </div>
             </div>

             <div className="sidebar-tabs-premium">
                <button className={activeTab === 'content' ? 'active' : ''} onClick={() => setActiveTab('content')}>
                   <MessageSquare size={16} /> Comments
                </button>
                <button className={activeTab === 'chat' ? 'active' : ''} onClick={() => setActiveTab('chat')}>
                   <Users size={16} /> Contributors
                </button>
             </div>

             <div className="sidebar-content-area">
                {activeTab === 'content' ? (
                  <div className="comments-section-premium">
                     {comments.length === 0 ? (
                       <div className="no-comments">
                          <MessageSquare size={32} />
                          <p>No comments yet. Be the first!</p>
                       </div>
                     ) : (
                       <div className="comments-list-premium">
                          {comments.map((c, i) => (
                            <motion.div 
                              key={c.id} 
                              initial={{ opacity: 0, x: 20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.05 }}
                              className="comment-card-premium"
                            >
                               <img src={c.profiles?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.profiles?.username}`} alt="" />
                               <div className="comment-content-wrap">
                                  <div className="comment-user-row">
                                     <strong>{c.profiles?.display_name || c.profiles?.username}</strong>
                                     <span>{formatDistanceToNow(new Date(c.created_at))}</span>
                                  </div>
                                  <p>{c.content}</p>
                               </div>
                            </motion.div>
                          ))}
                          
                          {hasMoreComments && (
                            <button className="load-more-btn-text" onClick={handleLoadMoreComments} disabled={loadingComments}>
                               {loadingComments ? 'Loading...' : 'Load more comments'}
                            </button>
                          )}
                       </div>
                     )}
                  </div>
                ) : (
                  <div className="contributors-list-premium">
                     <div className="contributor-card-sm owner">
                        <img src={capsule.profiles?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${capsule.profiles?.username}`} alt="" />
                        <div className="contributor-info">
                           <strong>{capsule.profiles?.display_name || capsule.profiles?.username}</strong>
                           <span>Capsule Owner</span>
                        </div>
                        <div className="role-badge">Owner</div>
                     </div>
                     <p className="contributor-hint">Only participants can add content to this capsule.</p>
                     {isOwner && (
                       <button className="primary-btn-premium add-member-btn">
                          <Plus size={18} /> Invite Member
                       </button>
                     )}
                  </div>
                )}
             </div>

             <div className="sidebar-footer-premium">
                <div className="footer-actions">
                   <button className={`footer-btn like-btn ${isLiked ? 'active' : ''}`} onClick={handleLike}>
                      <Heart size={24} fill={isLiked ? "currentColor" : "none"} />
                      <span>{likeCount}</span>
                   </button>
                   <div className="footer-comment-input">
                      <input 
                        type="text" 
                        placeholder="Add a comment..." 
                        value={comment}
                        onChange={e => setComment(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSendComment()}
                      />
                      <button className="send-btn-circle" disabled={!comment.trim()} onClick={handleSendComment}>
                         <Send size={18} />
                      </button>
                   </div>
                </div>
             </div>
          </div>
        </div>

        {showAddItem && (
          <AddItem 
            capsuleId={capsule.id} 
            onClose={() => setShowAddItem(false)} 
            onSuccess={() => {
              setShowAddItem(false);
              fetchItems();
            }}
          />
        )}

        <style>{`
          .capsule-detail-modal { max-width: 1200px; width: 95%; height: 85vh; border-radius: 32px; overflow: hidden; padding: 0 !important; }
          .detail-layout { display: flex; height: 100%; }
          
          /* Media Pane */
          .detail-media-pane { flex: 1; background: #0F0B1E; position: relative; overflow-y: auto; scrollbar-width: none; }
          .detail-media-pane::-webkit-scrollbar { display: none; }
          
          .sealed-hero-view { height: 100%; position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 40px; overflow: hidden; padding: 40px; }
          .sealed-background-glow { position: absolute; inset: 0; background: radial-gradient(circle at center, rgba(124, 92, 191, 0.2) 0%, transparent 70%); }
          
          .hero-model-container { position: relative; }
          
          .sealed-timer-card { background: rgba(255,255,255,0.05); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.1); padding: 30px 50px; border-radius: 28px; color: white; }
          .timer-header { display: flex; align-items: center; justify-content: center; gap: 10px; font-size: 13px; font-weight: 800; opacity: 0.6; letter-spacing: 2px; }
          .timer-value { font-size: 48px; font-weight: 900; margin: 10px 0; color: var(--accent); text-shadow: 0 0 20px rgba(124, 92, 191, 0.4); }
          .timer-hint { font-size: 14px; opacity: 0.5; margin: 0; }
          .unseal-action-btn { margin-top: 30px; padding: 20px 40px; border-radius: 100px; background: white; color: #0F0B1E; font-size: 18px; font-weight: 900; display: flex; align-items: center; gap: 12px; border: none; cursor: pointer; box-shadow: 0 15px 30px rgba(0,0,0,0.3); z-index: 10; position: relative; }

          .opened-hero-view { padding: 40px; display: flex; flex-direction: column; gap: 40px; }
          .opened-hero-top { display: flex; justify-content: center; width: 100%; margin-bottom: 20px; }
          .items-masonry-web { columns: 2; column-gap: 24px; }
          .item-card-premium { break-inside: avoid; margin-bottom: 24px; background: #1A1530; border-radius: 24px; overflow: hidden; position: relative; box-shadow: 0 10px 30px rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.05); transition: transform 0.3s; }
          .item-card-premium:hover { transform: translateY(-5px); }
          .item-img { width: 100%; display: block; }
          .item-note-lg { padding: 40px; background: #FFF9E0; color: #5D4037; font-family: 'Georgia', serif; font-size: 1.2rem; font-style: italic; text-align: center; line-height: 1.6; }
          .item-footer-sm { position: absolute; bottom: 0; left: 0; right: 0; padding: 15px 20px; background: linear-gradient(transparent, rgba(0,0,0,0.8)); display: flex; align-items: center; gap: 10px; color: white; font-size: 0.85rem; font-weight: 700; opacity: 0; transition: opacity 0.3s; }
          .item-card-premium:hover .item-footer-sm { opacity: 1; }
          .item-footer-sm img { width: 24px; height: 24px; border-radius: 50%; }

          .add-item-card-dashed { break-inside: avoid; width: 100%; height: 200px; border: 2px dashed rgba(255,255,255,0.1); border-radius: 24px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: rgba(255,255,255,0.4); background: rgba(255,255,255,0.02); cursor: pointer; transition: all 0.2s; }
          .add-item-card-dashed:hover { background: rgba(255,255,255,0.05); color: white; border-color: var(--accent); }

          /* Sidebar */
          .detail-sidebar-pane { width: 450px; background: white; display: flex; flex-direction: column; }
          .sidebar-header-premium { padding: 30px; border-bottom: 1px solid var(--border); }
          .user-info-row { display: flex; align-items: center; gap: 15px; margin-bottom: 25px; }
          .author-avatar { width: 48px; height: 48px; border-radius: 50%; border: 2px solid var(--primary-light); }
          .author-names h4 { margin: 0; font-size: 16px; font-weight: 800; }
          .display-name-wrap { display: flex; align-items: center; gap: 6px; }
          .author-names p { margin: 2px 0 0; font-size: 13px; color: var(--text-muted); }
          .close-x-btn { margin-left: auto; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--background); color: var(--text-sec); }

          .capsule-title-lg { font-size: 28px; font-weight: 900; margin: 0 0 10px 0; }
          .capsule-description-lg { font-size: 15px; color: var(--text-sec); margin-bottom: 20px; line-height: 1.5; }
          .stats-row-premium { display: flex; gap: 12px; }
          .stat-pill-sm { background: var(--surface-alt); padding: 8px 14px; border-radius: 12px; display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; color: var(--text-sec); }
          .share-btn-pill { background: white; border: 1.5px solid var(--border); padding: 8px 14px; border-radius: 12px; display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; color: var(--text-sec); cursor: pointer; }

          .sidebar-tabs-premium { display: flex; gap: 20px; padding: 0 30px; margin: 20px 0; border-bottom: 1px solid var(--border); }
          .sidebar-tabs-premium button { padding: 12px 0; background: none; border: none; font-weight: 800; font-size: 14px; color: var(--text-muted); display: flex; align-items: center; gap: 8px; cursor: pointer; position: relative; }
          .sidebar-tabs-premium button.active { color: var(--primary); }
          .sidebar-tabs-premium button.active::after { content: ''; position: absolute; bottom: -1px; left: 0; right: 0; height: 3px; background: var(--primary); border-radius: 3px; }

          .sidebar-content-area { flex: 1; overflow-y: auto; padding: 0 30px 20px; }
          .comment-card-premium { display: flex; gap: 12px; margin-bottom: 20px; }
          .comment-card-premium img { width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0; }
          .comment-content-wrap { background: var(--surface-alt); padding: 15px; border-radius: 20px; flex: 1; }
          .comment-user-row { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 12px; }
          .comment-user-row span { color: var(--text-muted); }
          .comment-content-wrap p { margin: 0; font-size: 14px; line-height: 1.5; color: var(--text); }
          
          .no-comments { padding: 40px 0; text-align: center; color: var(--text-muted); }

          .sidebar-footer-premium { padding: 25px 30px; border-top: 1px solid var(--border); background: white; }
          .footer-actions { display: flex; align-items: center; gap: 15px; }
          .footer-btn { background: none; border: none; color: var(--text-sec); display: flex; flex-direction: column; align-items: center; gap: 4px; font-weight: 700; cursor: pointer; transition: all 0.2s; }
          .footer-btn.active { color: #ff4d8d; }
          
          .footer-comment-input { flex: 1; display: flex; align-items: center; background: var(--surface-alt); padding: 5px 5px 5px 20px; border-radius: 100px; border: 1.5px solid transparent; }
          .footer-comment-input:focus-within { border-color: var(--primary-light); background: white; box-shadow: 0 0 0 4px var(--primary-light); }
          .footer-comment-input input { flex: 1; border: none; background: none; outline: none; font-size: 14px; font-family: inherit; }
          .send-btn-circle { width: 38px; height: 38px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; border: none; cursor: pointer; }

          /* Unseal Animation */
          .epic-unseal-overlay { position: absolute; inset: 0; background: #0F0B1E; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 100; color: white; }
          .unseal-hero-img { width: 350px; height: 350px; object-fit: contain; z-index: 10; filter: drop-shadow(0 0 50px var(--accent)); }
          .energy-rings { position: absolute; width: 500px; height: 500px; display: flex; align-items: center; justify-content: center; }
          .ring { position: absolute; border: 2px solid var(--accent); border-radius: 50%; opacity: 0.3; }
          .ring-1 { width: 300px; height: 300px; animation: pulse 2s infinite; }
          .ring-2 { width: 450px; height: 450px; animation: pulse 3s infinite 0.5s; }
          .ring-3 { width: 600px; height: 600px; animation: pulse 4s infinite 1s; }
          @keyframes pulse { 0% { transform: scale(0.8); opacity: 0; } 50% { opacity: 0.5; } 100% { transform: scale(1.2); opacity: 0; } }
          
          .burst-glow { position: absolute; width: 600px; height: 600px; background: radial-gradient(circle, var(--accent) 0%, transparent 70%); opacity: 0.3; z-index: 1; }
          .epic-unseal-overlay h2 { margin-top: 40px; font-size: 24px; font-weight: 900; letter-spacing: 8px; color: var(--accent); }
        `}</style>
      </motion.div>
    </motion.div>
  );
};
