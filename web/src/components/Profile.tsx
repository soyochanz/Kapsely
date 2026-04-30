import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Grid, Unlock, Lock, Settings, Heart, MessageCircle, 
  Edit3, MapPin, Calendar, X, Clock, ShieldCheck, Share2, Plus
} from 'lucide-react';
import { getModelImage, getModelImageOpen } from '../constants/models';
import { EditProfile } from './EditProfile';
import CapsuleWithTimer from './CapsuleWithTimer';
import { format } from 'date-fns';

interface ProfileProps {
  userId: string;
  currentUserId: string;
  onClose: () => void;
  onSelectCapsule: (capsule: any) => void;
}

export const Profile: React.FC<ProfileProps> = ({ 
  userId, 
  currentUserId, 
  onClose, 
  onSelectCapsule 
}) => {
  const [profile, setProfile] = useState<any>(null);
  const [capsules, setCapsules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'opened' | 'sealed'>('all');
  const [showEdit, setShowEdit] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);

  useEffect(() => {
    fetchProfileData();
    checkFollowing();
  }, [userId]);

  const fetchProfileData = async () => {
    try {
      setLoading(true);
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) throw profileError;
      setProfile(profileData);

      const { data: capsuleData, error: capsuleError } = await supabase
        .from('capsules')
        .select(`
          *,
          profiles:owner_id(username, display_name, avatar_url, is_verified)
        `)
        .eq('owner_id', userId)
        .order('created_at', { ascending: false });

      if (capsuleError) throw capsuleError;
      setCapsules(capsuleData || []);
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkFollowing = async () => {
    if (userId === currentUserId) return;
    const { data } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', currentUserId)
      .eq('following_id', userId)
      .maybeSingle();
    setIsFollowing(!!data);
  };

  const handleFollow = async () => {
    if (userId === currentUserId) return;
    const wasFollowing = isFollowing;
    setIsFollowing(!wasFollowing);

    try {
      if (wasFollowing) {
        await supabase.from('follows').delete().eq('follower_id', currentUserId).eq('following_id', userId);
      } else {
        await supabase.from('follows').insert({ follower_id: currentUserId, following_id: userId });
      }
    } catch (err) {
      setIsFollowing(wasFollowing);
    }
  };

  const calculateTimeLeft = (opensAt: string) => {
    const difference = +new Date(opensAt) - +new Date();
    if (difference <= 0) return null;
    const h = Math.floor(difference / (1000 * 60 * 60));
    const m = Math.floor((difference / 1000 / 60) % 60);
    return `${h}h ${m}m`;
  };

  const filteredCapsules = capsules.filter(c => {
    if (activeTab === 'all') return true;
    return c.status === activeTab;
  });

  if (loading) return <div className="profile-loading"><div className="loader"></div></div>;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="profile-view-premium"
    >
      <div className="profile-top-nav">
         <button className="back-circle-btn" onClick={onClose}><X /></button>
         <div className="nav-user-title">
            <strong>{profile?.username}</strong>
            {profile?.is_verified && <ShieldCheck size={14} color="var(--primary)" fill="var(--primary-light)" />}
         </div>
         <button className="back-circle-btn"><Share2 size={20} /></button>
      </div>

      <header className="profile-hero-section">
        <div className="profile-avatar-premium">
          <img 
            src={profile?.avatar_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + profile?.username} 
            alt=""
          />
          {userId === currentUserId && (
            <button className="avatar-edit-badge" onClick={() => setShowEdit(true)}><Plus size={16} /></button>
          )}
        </div>

        <div className="profile-info-premium">
          <div className="profile-name-group">
            <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
               <h1>{profile?.display_name || profile?.username}</h1>
               {profile?.is_verified && <ShieldCheck size={24} color="var(--primary)" fill="var(--primary-light)" />}
            </div>
            
            <div className="profile-actions-row">
              {userId === currentUserId ? (
                <>
                  <button className="primary-profile-btn" onClick={() => setShowEdit(true)}>
                    <Edit3 size={18} /> Edit Profile
                  </button>
                  <button className="secondary-profile-btn"><Settings size={18} /></button>
                </>
              ) : (
                <>
                  <button 
                    className={`primary-profile-btn ${isFollowing ? 'following' : ''}`} 
                    onClick={handleFollow}
                  >
                    {isFollowing ? 'Following' : 'Follow'}
                  </button>
                  <button className="secondary-profile-btn">Message</button>
                </>
              )}
            </div>
          </div>
          
          <div className="profile-stats-premium">
            <div className="stat-item"><strong>{capsules.length}</strong><span>capsules</span></div>
            <div className="stat-item"><strong>{profile?.followers_count || 0}</strong><span>followers</span></div>
            <div className="stat-item"><strong>{profile?.following_count || 0}</strong><span>following</span></div>
          </div>
          
          <div className="profile-bio-premium">
            <p className="bio-text">{profile?.bio || 'Preserving memories in the digital void. ✨'}</p>
            <div className="bio-meta">
              {profile?.location && <span><MapPin size={14} /> {profile.location}</span>}
              <span><Calendar size={14} /> Joined {format(new Date(profile?.created_at), 'MMMM yyyy')}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="profile-tabs-premium">
        <button className={activeTab === 'all' ? 'active' : ''} onClick={() => setActiveTab('all')}>
          <Grid size={20} /> CAPSULES
        </button>
        <button className={activeTab === 'opened' ? 'active' : ''} onClick={() => setActiveTab('opened')}>
          <Unlock size={20} /> OPENED
        </button>
        <button className={activeTab === 'sealed' ? 'active' : ''} onClick={() => setActiveTab('sealed')}>
          <Lock size={20} /> SEALED
        </button>
      </div>

      <div className="profile-grid-premium">
        {filteredCapsules.map((capsule, idx) => {
          const isClosed = capsule.status === 'sealed';
          const hasMedia = !!(capsule.cover_url || (capsule.collage_items && capsule.collage_items.length > 0));
          const timeLeft = isClosed ? calculateTimeLeft(capsule.opens_at) : null;

          return (
            <motion.div
              key={capsule.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="grid-capsule-card"
              onClick={() => onSelectCapsule(capsule)}
            >
              <div className="grid-card-media" style={{ backgroundColor: isClosed ? '#1a1530' : '#f8f7ff', position: 'relative', overflow: 'hidden' }}>
                {hasMedia ? (
                   <div className="grid-media-mode" style={{ width: '100%', height: '100%', position: 'relative' }}>
                      {/* Background (Blurred if sealed) */}
                      <div className={`media-background ${isClosed ? 'is-blurred' : ''}`} style={{ width: '100%', height: '100%' }}>
                        {capsule.cover_url ? (
                          <img 
                            src={capsule.cover_url} 
                            className={isClosed ? "blurred-img-security" : "collage-img"} 
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            alt="" 
                          />
                        ) : (
                          <div className={isClosed ? "collage-grid-blurred" : `collage-grid items-${Math.min(capsule.collage_items?.length || 0, 4)}`} style={{ height: '100%' }}>
                            {capsule.collage_items?.slice(0, 4).map((item: any, i: number) => (
                              <img 
                                key={i} 
                                src={item.thumbnail_url || item.media_url} 
                                className={isClosed ? "blurred-img-security" : "collage-img"} 
                                style={{ width: '100%', height: '100%', objectFit: 'cover', border: !isClosed ? '0.5px solid rgba(255,255,255,0.3)' : 'none' }}
                                alt="" 
                              />
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Security Overlay */}
                      {isClosed && <div className="security-overlay" />}

                      {/* Corner Model */}
                      <div className="mini-model-badge" style={{ position: 'absolute', bottom: '10px', right: '10px', width: '45px', height: '45px', zIndex: 6 }}>
                        <CapsuleWithTimer 
                          modelKey={capsule.model}
                          source={isClosed ? getModelImage(capsule.model) : getModelImageOpen(capsule.model)}
                          date={capsule.opens_at}
                          style={{ width: '100%', height: '100%' }}
                          hideTimer={true}
                          hideParticles={true}
                          disableAnimations={true}
                        />
                      </div>
                   </div>
                ) : (
                  /* Center Model (No Media) */
                  <div className="grid-model-full-wrap" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onContextMenu={e => e.preventDefault()}>
                    <CapsuleWithTimer 
                      modelKey={capsule.model}
                      source={isClosed ? getModelImage(capsule.model) : getModelImageOpen(capsule.model)}
                      date={capsule.opens_at}
                      chainId={capsule.chain_id}
                      style={{ width: '70px', height: '70px' }}
                      isOpened={!isClosed}
                      lightweight={true}
                    />
                    {isClosed && <div className="security-overlay" />}
                  </div>
                )}

                {isClosed && (
                  <div className="grid-sealed-overlay">
                    <Lock size={20} color="#fff" />
                    {timeLeft && <span className="grid-timer" style={{ fontSize: '10px' }}>{timeLeft}</span>}
                  </div>
                )}
                
                <div className="grid-card-hover">
                   <div className="hover-stat"><Heart size={18} fill="white" /> {capsule.likes_count || 0}</div>
                   <div className="hover-stat"><MessageCircle size={18} fill="white" /> {capsule.comments_count || 0}</div>
                </div>
              </div>
            </motion.div>
          );
        })}
        
        {filteredCapsules.length === 0 && (
          <div className="empty-grid-placeholder">
             <div className="empty-icon-circle"><Lock size={40} /></div>
             <h3>No Capsules Yet</h3>
             <p>When {profile?.display_name || profile?.username} creates a capsule, it will appear here.</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showEdit && (
          <EditProfile 
            profile={profile} 
            onClose={() => setShowEdit(false)} 
            onUpdate={fetchProfileData} 
          />
        )}
      </AnimatePresence>

      <style>{`
        .profile-view-premium { width: 100%; max-width: 950px; margin: 0 auto; padding-bottom: 100px; }
        
        .profile-top-nav { display: flex; align-items: center; justify-content: space-between; padding: 20px 0; margin-bottom: 20px; }
        .back-circle-btn { width: 44px; height: 44px; border-radius: 50%; background: white; border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; color: var(--text); }
        .nav-user-title { display: flex; align-items: center; gap: 6px; }
        .nav-user-title strong { font-size: 16px; font-weight: 800; }

        .profile-hero-section { display: flex; gap: 60px; align-items: flex-start; margin-bottom: 60px; padding: 0 20px; }
        .profile-avatar-premium { width: 160px; height: 160px; border-radius: 50%; position: relative; flex-shrink: 0; }
        .profile-avatar-premium img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: 4px solid white; box-shadow: 0 15px 35px rgba(124, 92, 191, 0.15); }
        .avatar-edit-badge { position: absolute; bottom: 5px; right: 5px; width: 36px; height: 36px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; border: 3px solid white; box-shadow: 0 5px 15px rgba(0,0,0,0.1); }

        .profile-info-premium { flex: 1; }
        .profile-name-group { display: flex; flex-direction: column; gap: 20px; margin-bottom: 25px; }
        .profile-name-group h1 { font-size: 28px; font-weight: 300; margin: 0; }
        .profile-actions-row { display: flex; gap: 10px; }
        
        .primary-profile-btn { padding: 10px 25px; border-radius: 12px; background: var(--primary); color: white; font-weight: 700; font-size: 14px; display: flex; align-items: center; gap: 8px; }
        .primary-profile-btn.following { background: white; color: var(--text); border: 1.5px solid var(--border); }
        .secondary-profile-btn { width: 40px; height: 40px; border-radius: 12px; border: 1.5px solid var(--border); background: white; display: flex; align-items: center; justify-content: center; color: var(--text-sec); }

        .profile-stats-premium { display: flex; gap: 40px; margin-bottom: 25px; }
        .stat-item { display: flex; gap: 6px; font-size: 16px; }
        .stat-item strong { font-weight: 800; color: var(--text); }
        .stat-item span { color: var(--text-sec); }

        .bio-text { font-size: 15px; font-weight: 600; line-height: 1.5; color: var(--text); margin-bottom: 12px; }
        .bio-meta { display: flex; gap: 20px; color: var(--text-muted); font-size: 13px; font-weight: 700; }
        .bio-meta span { display: flex; align-items: center; gap: 6px; }

        .profile-tabs-premium { display: flex; justify-content: center; gap: 60px; border-top: 1px solid var(--border); margin-bottom: 30px; }
        .profile-tabs-premium button { padding: 18px 0; font-size: 12px; font-weight: 800; letter-spacing: 1px; color: var(--text-muted); display: flex; align-items: center; gap: 10px; border-top: 2px solid transparent; margin-top: -1px; }
        .profile-tabs-premium button.active { color: var(--text); border-top-color: var(--text); }

        .profile-grid-premium { display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px; }
        .grid-capsule-card { aspect-ratio: 1; border-radius: 24px; overflow: hidden; cursor: pointer; position: relative; }
        .grid-card-media { width: 100%; height: 100%; position: relative; display: flex; align-items: center; justify-content: center; }
        .grid-model-full-wrap { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; transform: translateY(5px); }
        .grid-sealed-overlay { position: absolute; inset: 0; background: rgba(15,11,30,0.15); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: white; pointer-events: none; }
        .grid-timer { display: none; }

        .grid-card-hover { position: absolute; inset: 0; background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; gap: 20px; opacity: 0; transition: opacity 0.2s; color: white; }
        .grid-capsule-card:hover .grid-card-hover { opacity: 1; }
        .hover-stat { display: flex; align-items: center; gap: 6px; font-weight: 800; font-size: 18px; }

        .empty-grid-placeholder { grid-column: span 3; padding: 100px 0; text-align: center; color: var(--text-muted); }
        .empty-icon-circle { width: 80px; height: 80px; border-radius: 50%; border: 2px solid var(--border); display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; color: var(--border); }
        .empty-grid-placeholder h3 { font-size: 20px; color: var(--text); margin-bottom: 8px; }

        /* Collage styles for grid */
        .web-collage-container { width: 100%; height: 100%; position: relative; }
        .collage-img { width: 100%; height: 100%; object-fit: cover; }
        .collage-grid { display: grid; height: 100%; gap: 1px; }
        .collage-grid.items-2 { grid-template-columns: 1fr 1fr; }
        .collage-grid.items-3 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
        .collage-grid.items-3 img:nth-child(1) { grid-row: span 2; }
        .collage-grid.items-4 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
        .mini-model-badge { position: absolute; bottom: 12px; right: 12px; width: 40px; height: 40px; background: white; border-radius: 12px; display: flex; align-items: center; justify-content: center; box-shadow: 0 5px 15px rgba(0,0,0,0.2); }
        .mini-model-badge img { width: 80%; height: 80%; object-fit: contain; }
      `}</style>
    </motion.div>
  );
};
