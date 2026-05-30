import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Grid, Unlock, Lock, Settings, Heart, MessageCircle, 
  Edit3, MapPin, Calendar, X, Share2, Plus
} from 'lucide-react';
import { getModelImage, getModelImageOpen } from '../constants/models';
import { EditProfile } from './EditProfile';
import CapsuleWithTimer from './CapsuleWithTimer';
import { format } from 'date-fns';
import VerifiedBadge from './VerifiedBadge';

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
  const SIMPLE_FRONTEND_PROFILE = true;
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
      if (SIMPLE_FRONTEND_PROFILE) {
        const [
          profileRes,
          followersRes,
          followingRes,
          followRes,
          ownedCapsulesRes,
          memberInvitesRes,
        ] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', userId).single(),
          supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', userId),
          supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', userId),
          currentUserId !== userId
            ? supabase.from('follows').select('id').eq('follower_id', currentUserId).eq('following_id', userId).maybeSingle()
            : Promise.resolve({ data: null } as any),
          supabase.from('capsules').select('*').eq('owner_id', userId).order('created_at', { ascending: false }),
          supabase.from('capsule_invites').select('capsule_id').eq('user_id', userId).eq('status', 'accepted'),
        ]);

        const ownedCapsules = ownedCapsulesRes.data || [];
        const memberCapsuleIds = (memberInvitesRes.data || []).map((invite: any) => invite.capsule_id).filter(Boolean);
        const memberCapsulesRes = memberCapsuleIds.length
          ? await supabase.from('capsules').select('*').in('id', memberCapsuleIds).order('created_at', { ascending: false })
          : { data: [] as any[] };
        const mergedCapsules = Array.from(
          new Map([...ownedCapsules, ...(memberCapsulesRes.data || [])].map((capsule: any) => [capsule.id, capsule])).values()
        );
        const capsuleIds = mergedCapsules.map((capsule: any) => capsule.id);
        const mediaRes = capsuleIds.length
          ? await supabase.from('capsule_items')
              .select('id, capsule_id, media_url, thumbnail_url, media_type, created_at')
              .in('capsule_id', capsuleIds)
              .eq('is_story', false)
              .neq('moderation_status', 'rejected')
              .order('created_at', { ascending: false })
          : { data: [] as any[] };

        const mediaByCapsule = new Map<string, any[]>();
        (mediaRes.data || []).forEach((item: any) => {
          const list = mediaByCapsule.get(item.capsule_id) || [];
          if (list.length < 4) list.push(item);
          mediaByCapsule.set(item.capsule_id, list);
        });

        setProfile(profileRes.data ? {
          ...profileRes.data,
          followers_count: followersRes.count || 0,
          following_count: followingRes.count || 0,
          capsules_count: mergedCapsules.length,
        } : null);
        setCapsules(mergedCapsules.map((capsule: any) => ({
          ...capsule,
          is_member_capsule: capsule.owner_id !== userId,
          effective_cover_url: capsule.cover_url || mediaByCapsule.get(capsule.id)?.[0]?.thumbnail_url || mediaByCapsule.get(capsule.id)?.[0]?.media_url,
          fallback_media: mediaByCapsule.get(capsule.id) || [],
        })).sort((a: any, b: any) => +new Date(b.created_at) - +new Date(a.created_at)));
        setIsFollowing(!!followRes.data);
        return;
      }

      const { data, error } = await supabase.rpc('get_profile_data_unified', {
        p_target_id: userId
      });

      if (error) throw error;
      setProfile(data?.profile || null);
      setCapsules(data?.capsules || []);
      setIsFollowing(!!data?.is_following);
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
         <div className="profile-top-spacer" />
         <div className="nav-user-title">
            <strong>{profile?.username}</strong>
            {profile?.is_verified && <VerifiedBadge size={14} />}
         </div>
         <button className="back-circle-btn"><Share2 size={20} /></button>
      </div>

      <header className="profile-hero-section">
        <div className="profile-banner-web">
          <span className="profile-sticker s1">✦</span>
          <span className="profile-sticker s2">♡</span>
          <span className="profile-sticker s3">⌁</span>
        </div>
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
               {profile?.is_verified && <VerifiedBadge size={24} />}
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
            <div className="stat-item"><strong>{profile?.capsules_count ?? capsules.length}</strong><span>capsules</span></div>
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
          const collageItems = capsule.collage_items || capsule.fallback_media || [];
          const effectiveCover = capsule.effective_cover_url || capsule.cover_url;
          const hasMedia = !isClosed && !!(effectiveCover || collageItems.length > 0);
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
                {isClosed ? (
                  <div className="grid-model-full-wrap sealed-profile-model" onContextMenu={e => e.preventDefault()}>
                    <CapsuleWithTimer 
                      modelKey={capsule.model}
                      source={getModelImage(capsule.model)}
                      date={capsule.opens_at}
                      modelLayout={capsule.model_snapshot}
                      chainId={capsule.chain_id}
                      style={{ width: '88%', height: '88%' }}
                      isOpened={false}
                      lightweight={true}
                    />
                  </div>
                ) : hasMedia ? (
                   <div className="grid-media-mode" style={{ width: '100%', height: '100%', position: 'relative' }}>
                      {/* Background (Blurred if sealed) */}
                      <div className={`media-background ${isClosed ? 'is-blurred secure-locked-media' : ''}`} style={{ width: '100%', height: '100%' }}>
                        {isClosed ? (
                          <div className="secure-locked-art" />
                        ) : effectiveCover ? (
                          <img 
                            src={effectiveCover} 
                            className="collage-img" 
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            alt="" 
                          />
                        ) : (
                          <div className={`collage-grid items-${Math.min(collageItems.length || 0, 4)}`} style={{ height: '100%' }}>
                            {collageItems.slice(0, 4).map((item: any, i: number) => (
                              <img 
                                key={i} 
                                src={item.thumbnail_url || item.media_url} 
                                className="collage-img" 
                                style={{ width: '100%', height: '100%', objectFit: 'cover', border: '0.5px solid rgba(255,255,255,0.3)' }}
                                alt="" 
                              />
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Corner Model */}
                      <div className="mini-model-badge" style={{ position: 'absolute', bottom: '8px', right: '8px', width: '62px', height: '62px', zIndex: 6 }}>
                        <CapsuleWithTimer 
                          modelKey={capsule.model}
                          source={isClosed ? getModelImage(capsule.model) : getModelImageOpen(capsule.model)}
                          date={capsule.opens_at}
                          modelLayout={capsule.model_snapshot}
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
                      modelLayout={capsule.model_snapshot}
                      chainId={capsule.chain_id}
                      style={{ width: '82%', height: '82%' }}
                      isOpened={!isClosed}
                      lightweight={true}
                    />
                    {isClosed && <div className="security-overlay" />}
                  </div>
                )}

                <div className="grid-card-hover">
                   <div className="hover-stat"><Heart size={18} fill="white" /> {capsule.likes_count || 0}</div>
                   <div className="hover-stat"><MessageCircle size={18} fill="white" /> {capsule.comments_count || 0}</div>
                </div>
              </div>
              <div className="grid-card-meta">
                <strong title={capsule.title}>{capsule.title || 'Untitled'}</strong>
                <div className="grid-card-stats">
                  <span className="heart-stat">♥ {capsule.likes_count || 0}</span>
                  <span className="comment-stat">● {capsule.comments_count || 0}</span>
                  <span className="image-stat">▧ {capsule.posts_count || capsule.items_count || collageItems.length || 0}</span>
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
        .profile-top-spacer { width: 44px; height: 44px; }
        .back-circle-btn { width: 44px; height: 44px; border-radius: 50%; background: white; border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; color: var(--text); }
        .nav-user-title { display: flex; align-items: center; gap: 6px; }
        .nav-user-title strong { font-size: 16px; font-weight: 800; }

        .profile-hero-section { position: relative; display: flex; gap: 60px; align-items: flex-start; margin-bottom: 60px; padding: 116px 20px 0; overflow: hidden; border-radius: 28px; }
        .profile-banner-web { position: absolute; inset: 0 0 auto; height: 178px; border-radius: 28px; background: radial-gradient(circle at 18% 20%, rgba(255,77,141,0.22), transparent 28%), radial-gradient(circle at 80% 18%, rgba(124,92,191,0.28), transparent 30%), linear-gradient(135deg, #f7f2ff, #ffffff 48%, #eef9ff); border: 1px solid rgba(232,228,245,0.9); }
        .profile-sticker { position: absolute; display: grid; place-items: center; width: 42px; height: 42px; border-radius: 16px; background: rgba(255,255,255,0.78); color: var(--primary); font-weight: 900; box-shadow: 0 12px 28px rgba(124,92,191,0.12); }
        .profile-sticker.s1 { left: 7%; top: 24px; transform: rotate(-10deg); }
        .profile-sticker.s2 { right: 14%; top: 34px; transform: rotate(8deg); color: var(--secondary); }
        .profile-sticker.s3 { right: 32%; top: 96px; transform: rotate(-5deg); }
        .profile-avatar-premium { width: 160px; height: 160px; border-radius: 50%; position: relative; flex-shrink: 0; z-index: 1; }
        .profile-avatar-premium img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: 4px solid white; box-shadow: 0 15px 35px rgba(124, 92, 191, 0.15); }
        .avatar-edit-badge { position: absolute; bottom: 5px; right: 5px; width: 36px; height: 36px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; border: 3px solid white; box-shadow: 0 5px 15px rgba(0,0,0,0.1); }

        .profile-info-premium { flex: 1; position: relative; z-index: 1; padding-top: 58px; }
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

        .profile-grid-premium { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .grid-capsule-card { border-radius: 8px; overflow: hidden; cursor: pointer; position: relative; background: white; border: 1px solid rgba(232,228,245,0.75); }
        .grid-card-media { width: 100%; aspect-ratio: 1; position: relative; display: flex; align-items: center; justify-content: center; }
        .grid-card-meta { padding: 9px 10px 10px; background: white; }
        .grid-card-meta strong { display: block; font-size: 13px; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 6px; }
        .grid-card-stats { display: flex; gap: 8px; align-items: center; font-size: 12px; font-weight: 800; }
        .heart-stat { color: #F43F5E; }
        .comment-stat { color: #0EA5E9; }
        .image-stat { color: #A855F7; }
        .grid-model-full-wrap { position: absolute; inset: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; transform: translateY(5px); background: #f8f7ff; }
        .sealed-profile-model { transform: none; }
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
        .mini-model-badge { background: transparent !important; border-radius: 0; display: flex; align-items: center; justify-content: center; box-shadow: none; pointer-events: none; }
        .mini-model-badge img { width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 8px 14px rgba(15,11,30,0.22)); }
      `}</style>
    </motion.div>
  );
};
