import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './lib/supabase';
import { 
  MoreHorizontal, 
  Search, 
  Bell, 
  User, 
  Home,
  Camera,
  Calendar as CalendarIcon,
  Clock as ClockIcon,
  Plus, 
  Heart, 
  MessageCircle, 
  Compass, 
  LogOut, 
  Lock, 
  Unlock,
  Clock, 
  Share2 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { CapsuleDetail } from './components/CapsuleDetail';
import { Auth } from './components/Auth';
import { CreateCapsule } from './components/CreateCapsule';
import { Profile } from './components/Profile';
import { ChatList } from './components/ChatList';
import { ChatRoom } from './components/ChatRoom';
import { 
  getModelImage, 
  getModelImageOpen, 
  getModelTint,
  getAvatarUrl,
  typeConfig 
} from './constants/models';
import { Search as SearchView } from './components/Search';
import CapsuleWithTimer from './components/CapsuleWithTimer';
import { Notifications } from './components/Notifications';
import { FlashBar } from './components/FlashBar';
import { Sliders, ShieldCheck } from 'lucide-react';
import { AdminPanel } from './components/AdminPanel';
import VerifiedBadge from './components/VerifiedBadge';

const formatFeedEvent = (eventType: string) => {
  switch (eventType) {
    case 'capsule_opened':
      return 'Capsula abierta';
    case 'item_batch_added':
      return 'Nuevos recuerdos';
    case 'opening_soon':
      return 'Abre pronto';
    case 'birthday':
      return 'Cumpleanos';
    case 'capsule_commented':
      return 'Actividad';
    case 'recommendation':
      return 'Recomendado';
    default:
      return 'Capsula';
  }
};

function App() {
  const [session, setSession] = useState<any>(null);
  const [feed, setFeed] = useState<any[]>([]);
  const [stories, setStories] = useState<any[]>([]);
  const [myStory, setMyStory] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCapsule, setSelectedCapsule] = useState<any>(null);
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'feed' | 'chat' | 'explore' | 'search' | 'create' | 'notifications' | 'admin'>('feed');
  const [activeFilter, setActiveFilter] = useState<'all' | 'opened' | 'sealed'>('all');
  const [activeChat, setActiveChat] = useState<{id: string, participant: any} | null>(null);
  const [feedTab, setFeedTab] = useState<'following' | 'explore'>('following');
  const [feedCursor, setFeedCursor] = useState<{ score: number | null; activityDate: string | null; id: string | null } | null>(null);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeStoryGroup, setActiveStoryGroup] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const feedSessionId = useRef(`web-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const fetchSeq = useRef(0);
  const PAGE_SIZE = 15;

  const calculateTimeLeft = (opensAt: string) => {
    const difference = +new Date(opensAt) - +new Date();
    if (difference <= 0) return null;
    const h = Math.floor(difference / (1000 * 60 * 60));
    const m = Math.floor((difference / 1000 / 60) % 60);
    const s = Math.floor((difference / 1000) % 60);
    return `${h}:${m < 10 ? '0'+m : m}:${s < 10 ? '0'+s : s}`;
  };

  const [authChecking, setAuthChecking] = useState(true);

  const normalizedFilter = activeFilter === 'opened' ? 'open' : activeFilter === 'sealed' ? 'closed' : 'all';
  
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthChecking(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchUserProfile(session.user.id);
      } else {
        setUserProfile(null);
        setFeed([]);
        setStories([]);
        setMyStory(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user?.id) return;
    feedSessionId.current = `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    fetchUserProfile(session.user.id);
    fetchFeed(false, 'initial_load');
    fetchSuggestions(session.user.id);
  }, [session?.user?.id, activeFilter, feedTab]);

  const fetchUserProfile = async (userId: string) => {
    const { data } = await supabase.rpc('get_profile_data_unified', { p_target_id: userId });
    if (data?.profile) {
      setUserProfile(data.profile);
    }
  };

  const fetchSuggestions = async (userId: string) => {
    const { data: following } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', userId);
    const excludedIds = new Set<string>((following || []).map((f: any) => f.following_id));
    excludedIds.add(userId);

    const { data } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, is_verified, favorite_color')
      .not('id', 'in', `(${Array.from(excludedIds).join(',')})`)
      .order('is_verified', { ascending: false })
      .limit(6);

    setSuggestions(data || []);
  };

  const followSuggestion = async (targetId: string) => {
    if (!session?.user?.id) return;
    const { error } = await supabase.from('follows').insert({
      follower_id: session.user.id,
      following_id: targetId
    });
    if (!error) setSuggestions(prev => prev.filter(user => user.id !== targetId));
  };

  const recordImpressions = useCallback(async (items: any[], startPosition = 0) => {
    if (!session?.user?.id || items.length === 0) return;

    const feedEventIds = items.map(item => item.feed_item_key || item.feed_event_id || item.id).filter(Boolean);
    if (feedEventIds.length === 0) return;

    const capsuleIds = items.map(item => item.capsule_id || null);
    const eventTypes = items.map(item => item.event_type || item.feed_type || 'web');
    const positions = items.map((_, index) => startPosition + index);

    await supabase.rpc('record_feed_impressions', {
      p_user_id: session.user.id,
      p_feed_event_ids: feedEventIds,
      p_capsule_ids: capsuleIds,
      p_event_types: eventTypes,
      p_feed_type: feedTab,
      p_session_id: feedSessionId.current,
      p_positions: positions
    });
  }, [feedTab, session?.user?.id]);

  const recordFeedOpen = useCallback(async (capsule: any) => {
    if (!session?.user?.id) return;
    await supabase.rpc('record_feed_click', {
      p_user_id: session.user.id,
      p_capsule_id: capsule.capsule_id || capsule.id,
      p_feed_event_id: capsule.feed_item_key || capsule.feed_event_id || capsule.id
    });
  }, [session?.user?.id]);

  const fetchFeed = async (isLoadMore = false, refreshMode: 'initial_load' | 'pull_to_refresh' | 'infinite_scroll' = 'initial_load') => {
    const seq = ++fetchSeq.current;
    try {
      if (isLoadMore) setLoadingMore(true);
      else if (refreshMode === 'pull_to_refresh') setRefreshing(true);
      else {
        setLoading(true);
      }

      const cursor = isLoadMore ? feedCursor : null;
      const effectiveMode = isLoadMore ? 'infinite_scroll' : refreshMode;

      const { data, error } = await supabase.rpc('get_combined_feed_data', {
        p_tab: feedTab,
        p_filter: normalizedFilter,
        p_limit: PAGE_SIZE,
        p_offset: 0,
        p_seed: Date.now() % 100000,
        p_refresh_mode: effectiveMode,
        p_session_id: feedSessionId.current,
        p_cursor_score: cursor?.score ?? null,
        p_cursor_activity_date: cursor?.activityDate ?? null,
        p_cursor_id: cursor?.id ?? null
      });

      if (error) throw error;
      if (seq !== fetchSeq.current) return;
      
      const newItems = data?.feed || [];
      const storiesData = data?.stories || [];
      const myId = session?.user?.id;
      const lastItem = newItems[newItems.length - 1];

      if (isLoadMore) {
        setFeed(prev => {
          const existing = new Set(prev.map(item => item.feed_item_key || item.feed_event_id || item.id));
          const merged = [...prev, ...newItems.filter((item: any) => !existing.has(item.feed_item_key || item.feed_event_id || item.id))];
          recordImpressions(newItems, prev.length).catch(err => console.warn('Unable to record web feed impressions', err));
          return merged;
        });
      } else {
        setFeed(newItems);
        setFeedCursor(null);
        recordImpressions(newItems, 0).catch(err => console.warn('Unable to record web feed impressions', err));
        // Process stories
        if (myId) {
          const usersWithStories: any[] = [];
          storiesData.forEach((s: any) => {
            let group = usersWithStories.find(u => u.owner_id === s.owner_id);
            if (!group) {
              group = { ...s.profiles, owner_id: s.owner_id, stories: [] };
              usersWithStories.push(group);
            }
            group.stories.push(s);
          });

          const processed = usersWithStories
            .map(u => ({ ...u, all_read: u.stories.every((s: any) => s.is_read) }))
            .sort((a, b) => {
              if (a.owner_id === myId) return -1;
              if (b.owner_id === myId) return 1;
              if (a.all_read !== b.all_read) return a.all_read ? 1 : -1;
              return 0;
            });

          setStories(processed.filter(u => u.owner_id !== myId));
          setMyStory(processed.find(u => u.owner_id === myId) || null);
        }
        if (refreshMode === 'pull_to_refresh') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }

      setFeedCursor(lastItem ? {
        score: lastItem.cursor_score ?? lastItem.final_score ?? null,
        activityDate: lastItem.cursor_activity_date ?? lastItem.activity_date ?? null,
        id: lastItem.cursor_id ?? lastItem.feed_item_key ?? lastItem.feed_event_id ?? lastItem.id ?? null
      } : cursor);
      
      setHasNextPage(newItems.length >= PAGE_SIZE);
    } catch (err) {
      console.error('Error fetching feed:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  };

  const fetchNextPage = () => {
    if (!loadingMore && hasNextPage) {
      fetchFeed(true, 'infinite_scroll');
    }
  };

  if (authChecking) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F7FF' }}>
        <div className="loader"></div>
      </div>
    );
  }

  if (!session) {
    return <Auth />;
  }

  const renderCapsuleCard = (capsule: any) => {
    const timeLeft = capsule.status === 'sealed' ? calculateTimeLeft(capsule.opens_at) : null;
    const isClosed = capsule.status === 'sealed';
    const profile = capsule.profiles || {};
    const cfg = typeConfig[capsule.type as keyof typeof typeConfig] || typeConfig.default;
    const TypeIcon = cfg.icon === 'camera' ? Camera : (cfg.icon === 'calendar' ? CalendarIcon : ClockIcon);
    
    const hasMedia = !!(capsule.cover_url || (capsule.collage_items && capsule.collage_items.length > 0));
    
    const openCapsule = async () => {
      await recordFeedOpen(capsule).catch(() => {});
      setSelectedCapsule(capsule);
    };

    return (
      <div key={capsule.feed_item_key || capsule.id} className={`capsule-card-premium event-${capsule.event_type || 'capsule'}`} onClick={openCapsule}>
        <div className="card-header">
          <div className="user-info" onClick={(e) => { e.stopPropagation(); setViewingProfileId(capsule.owner_id); }}>
            <img 
              src={getAvatarUrl(profile.avatar_url, profile.display_name || profile.username, profile.favorite_color)} 
              className="user-avatar" 
              alt="" 
            />
            <div className="user-names">
              <span className="display-name">{profile.display_name || profile.username}</span>
              <span className="username">@{profile.username}</span>
            </div>
          </div>
          <button className="more-btn" onClick={(e) => e.stopPropagation()}><MoreHorizontal size={20} /></button>
        </div>

        <div 
          className="card-media-container" 
          style={{ backgroundColor: isClosed ? '#1a1530' : '#f8f7ff', position: 'relative', height: '280px', overflow: 'hidden' }}
          onContextMenu={e => e.preventDefault()}
        >
          {/* Type badge */}
          <div className="type-badge-floating" style={{ backgroundColor: cfg.color, position: 'absolute', top: '12px', left: '12px', zIndex: 12, display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '20px', fontSize: '10px', color: 'white', fontWeight: 'bold' }}>
            <TypeIcon size={12} color="white" />
            <span>{cfg.label}</span>
          </div>

          {/* Status badge */}
          <div className="status-badge-floating" style={{ position: 'absolute', bottom: '12px', right: '12px', zIndex: 12, backgroundColor: !isClosed ? '#4ADE80' : '#F87171', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid white' }}>
             {isClosed ? <Lock size={12} color="white" /> : <Unlock size={12} color="white" />}
          </div>

          <div className="model-glow" />

          {hasMedia ? (
            <div className="media-mode-view" style={{ width: '100%', height: '100%', position: 'relative' }}>
              {/* Background Media (Blurred if sealed) */}
              <div className={`media-background ${isClosed ? 'is-blurred secure-locked-media' : ''}`} style={{ width: '100%', height: '100%' }}>
                 {isClosed ? (
                    <div className="secure-locked-art" />
                 ) : capsule.cover_url ? (
                    <img 
                      src={capsule.cover_url} 
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                      alt="" 
                      draggable={false}
                    />
                  ) : (
                    <div className="web-collage-grid">
                      {capsule.collage_items?.slice(0, 4).map((item: any, i: number) => (
                        <img 
                          key={i} 
                          src={item.thumbnail_url || item.media_url} 
                          style={{ width: '100%', height: '100%', objectFit: 'cover', border: '1px solid white' }} 
                          alt="" 
                          draggable={false}
                        />
                      ))}
                    </div>
                  )}
              </div>

              {/* Security Overlay */}
              {isClosed && <div className="security-overlay" />}

              {/* Small Corner Model */}
              <div style={{ position: 'absolute', bottom: '45px', right: '15px', width: '70px', height: '70px', zIndex: 11 }}>
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
            /* Big Center Model (No Media) */
            <div className="center-model-view" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
               <CapsuleWithTimer 
                 modelKey={capsule.model}
                 source={isClosed ? getModelImage(capsule.model) : getModelImageOpen(capsule.model)}
                 date={capsule.opens_at}
                 modelLayout={capsule.model_snapshot}
                 chainId={capsule.chain_id}
                 style={{ width: '180px', height: '180px' }}
                 isOpened={!isClosed}
                 lightweight={true}
               />
               {isClosed && <div className="security-overlay" />}
            </div>
          )}
        </div>

        <div className="card-footer">
          <div className="card-actions">
            <button className="action-btn"><Heart size={22} fill={capsule.is_liked ? "var(--secondary)" : "none"} color={capsule.is_liked ? "var(--secondary)" : "currentColor"} /> <span>{capsule.likes_count || 0}</span></button>
            <button className="action-btn"><MessageCircle size={22} /> <span>{capsule.comments_count || 0}</span></button>
            <button className="action-btn" style={{marginLeft: 'auto'}}><Share2 size={22} /></button>
          </div>
          <div className="card-content">
            {capsule.event_type && capsule.event_type !== 'capsule_created' && (
              <span className="event-pill">{formatFeedEvent(capsule.event_type)}</span>
            )}
            <h3>{capsule.title}</h3>
            {capsule.description && <p>{capsule.description}</p>}
            <div className="card-meta">
              <span className="tag">{capsule.type || 'Standard'}</span>
              <span style={{fontSize: '12px', color: 'var(--text-muted)'}}>{new Date(capsule.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="web-app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo" onClick={() => { setActiveView('feed'); setViewingProfileId(null); }}>
          Kapsely
        </div>
        
        <div className="sidebar-nav">
          <button 
            className={`nav-item ${activeView === 'feed' && feedTab === 'following' && !viewingProfileId ? 'active' : ''}`} 
            onClick={() => { setActiveView('feed'); setFeedTab('following'); setViewingProfileId(null); }}
          >
            <Home size={22} /> <span>Home</span>
          </button>
          
          <button 
            className={`nav-item ${activeView === 'search' ? 'active' : ''}`} 
            onClick={() => { setActiveView('search'); setViewingProfileId(null); }}
          >
            <Search size={22} /> <span>Search</span>
          </button>

          <button 
            className={`nav-item ${activeView === 'feed' && feedTab === 'explore' && !viewingProfileId ? 'active' : ''}`} 
            onClick={() => { setActiveView('feed'); setFeedTab('explore'); setViewingProfileId(null); }}
          >
            <Compass size={22} /> <span>Explore</span>
          </button>

          <button 
            className={`nav-item ${activeView === 'chat' ? 'active' : ''}`} 
            onClick={() => { setActiveView('chat'); setViewingProfileId(null); }}
          >
            <MessageCircle size={22} /> <span>Messages</span>
          </button>

          <button 
            className={`nav-item ${activeView === 'notifications' ? 'active' : ''}`} 
            onClick={() => { setActiveView('notifications'); setViewingProfileId(null); }}
          >
            <Bell size={22} /> <span>Notifications</span>
          </button>

          <button 
            className={`nav-item create-btn-sidebar ${activeView === 'create' ? 'active' : ''}`} 
            onClick={() => { setActiveView('create'); setViewingProfileId(null); }}
          >
            <div className="create-icon-wrapper"><Plus size={22} /></div>
            <span>Create</span>
          </button>

          <button 
            className={`nav-item ${viewingProfileId === session.user.id ? 'active' : ''}`} 
            onClick={() => setViewingProfileId(session.user.id)}
          >
            <div className="nav-avatar-sm">
               {session.user.user_metadata?.avatar_url ? (
                 <img src={session.user.user_metadata.avatar_url} alt="" style={{width: '100%', height: '100%', objectFit: 'cover'}} />
               ) : (
                 <User size={18} />
               )}
            </div>
            <span>Profile</span>
          </button>

          {userProfile?.is_admin && (
            <button 
              className={`nav-item admin-nav-item ${activeView === 'admin' ? 'active' : ''}`}
              onClick={() => {
                setActiveView('admin');
                setViewingProfileId(null);
              }}
            >
              <ShieldCheck size={22} color="var(--primary)" /> <span>Admin Panel</span>
            </button>
          )}
        </div>

        <div className="sidebar-footer">
          <button className="nav-item logout-item" onClick={() => supabase.auth.signOut()}>
            <LogOut size={20} /> <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <AnimatePresence mode="wait">
          {viewingProfileId ? (
            <Profile 
              key={`profile-${viewingProfileId}`}
              userId={viewingProfileId} 
              currentUserId={session.user.id} 
              onClose={() => setViewingProfileId(null)}
              onSelectCapsule={setSelectedCapsule}
            />
          ) : activeView === 'feed' ? (
            <div className="feed-container">
              <motion.div 
                key="feed"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="feed-main"
              >
                <header className="feed-view-header">
                  <div className="feed-tabs">
                    <button className={`feed-tab-item ${feedTab === 'following' ? 'active' : ''}`} onClick={() => setFeedTab('following')}>Following</button>
                    <button className={`feed-tab-item ${feedTab === 'explore' ? 'active' : ''}`} onClick={() => setFeedTab('explore')}>Explore</button>
                    <button className="feed-refresh-btn" onClick={() => fetchFeed(false, 'pull_to_refresh')} disabled={refreshing || loading}>
                      {refreshing ? 'Refreshing...' : 'Refresh'}
                    </button>
                  </div>

                  <FlashBar 
                    stories={stories} 
                    myStory={myStory} 
                    onPressMyStory={() => {}} 
                    onPressStory={(group) => setActiveStoryGroup(group)} 
                  />

                  <div className="filter-chips">
                    <button className={`chip ${activeFilter === 'all' ? 'active' : ''}`} onClick={() => setActiveFilter('all')}>Todo</button>
                    <button className={`chip ${activeFilter === 'opened' ? 'active' : ''}`} onClick={() => setActiveFilter('opened')}>Abiertas</button>
                    <button className={`chip ${activeFilter === 'sealed' ? 'active' : ''}`} onClick={() => setActiveFilter('sealed')}>Selladas</button>
                  </div>
                </header>

                {loading ? (
                  <div className="loading-state"><div className="loader"></div></div>
                ) : (
                  <div className="capsule-grid">
                    {feed.map(renderCapsuleCard)}
                  </div>
                )}

                {hasNextPage && (
                  <div style={{ textAlign: 'center', padding: '40px' }}>
                    <button 
                      className="chip"
                      onClick={() => fetchNextPage()}
                      disabled={loadingMore}
                    >
                      {loadingMore ? 'Loading...' : 'Load More'}
                    </button>
                  </div>
                )}
              </motion.div>

              <aside className="feed-right-sidebar">
                <div className="sidebar-section">
                  <h3 className="section-title">Suggestions</h3>
                  {suggestions.map(user => (
                    <div key={user.id} className="suggestion-item">
                      <div className="suggestion-user">
                        <div className="nav-avatar-sm" style={{width: '36px', height: '36px'}}>
                          <img src={getAvatarUrl(user.avatar_url, user.display_name || user.username, user.favorite_color)} alt="" />
                        </div>
                        <div className="user-names">
                          <span className="display-name">
                            {user.display_name || user.username}
                            {user.is_verified && <VerifiedBadge size={12} style={{ marginLeft: 4 }} />}
                          </span>
                          <span className="username">@{user.username}</span>
                        </div>
                      </div>
                      <button className="follow-btn-sm" onClick={() => followSuggestion(user.id)}>Seguir</button>
                    </div>
                  ))}
                </div>

                <div className="sidebar-section">
                  <h3 className="section-title">Trending Models</h3>
                  <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px'}}>
                    {['original', 'classic', 'modern', 'future'].map(m => (
                      <div key={m} style={{background: 'var(--surface-alt)', borderRadius: '12px', padding: '10px', textAlign: 'center'}}>
                        <img src={getModelImage(m)} style={{width: '40px', height: '40px', objectFit: 'contain'}} alt="" />
                        <div style={{fontSize: '11px', fontWeight: '700', textTransform: 'capitalize'}}>{m}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{fontSize: '12px', color: 'var(--text-muted)', padding: '0 10px'}}>
                   © 2026 Kapsely from Ochanz • Help • Privacy • Terms
                </div>
              </aside>
            </div>
          ) : activeView === 'search' ? (
            <SearchView key="search" onSelectUser={(id) => setViewingProfileId(id)} onSelectCapsule={setSelectedCapsule} />
          ) : activeView === 'chat' ? (
            <div className="chat-layout-web" style={{display: 'flex', height: '100%', width: '100%', background: '#fff'}}>
               <ChatList currentUserId={session.user.id} onSelectChat={(id, participant) => setActiveChat({id, participant})} />
               {activeChat ? (
                 <ChatRoom chatId={activeChat.id} participant={activeChat.participant} currentUserId={session.user.id} onBack={() => setActiveChat(null)} />
               ) : (
                 <div style={{flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888'}}>
                   Select a conversation to start chatting
                 </div>
               )}
            </div>
          ) : activeView === 'notifications' ? (
            <Notifications key="notifications" currentUserId={session.user.id} />
          ) : activeView === 'create' ? (
            <CreateCapsule key="create" onClose={() => setActiveView('feed')} />
          ) : activeView === 'admin' ? (
            <AdminPanel key="admin" />
          ) : null}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {selectedCapsule && (
          <CapsuleDetail 
            capsule={selectedCapsule} 
            onClose={() => setSelectedCapsule(null)} 
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeStoryGroup && (
          <div className="modal-overlay" onClick={() => setActiveStoryGroup(null)}>
            <div className="modal-content" style={{maxWidth: '400px', width: '100%', aspectRatio: '9/16', background: '#000'}} onClick={e => e.stopPropagation()}>
               <div style={{position: 'absolute', top: 0, left: 0, right: 0, height: '4px', display: 'flex', gap: '4px', padding: '10px 10px 0'}}>
                  {activeStoryGroup.stories.map((s: any, i: number) => (
                    <div key={i} style={{flex: 1, height: '2px', background: 'rgba(255,255,255,0.3)', borderRadius: '2px'}}>
                      <div style={{width: '100%', height: '100%', background: '#fff', borderRadius: '2px'}} />
                    </div>
                  ))}
               </div>
               <div style={{padding: '40px 20px', height: '100%', display: 'flex', flexDirection: 'column', color: '#fff'}}>
                  <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px'}}>
                    <img src={activeStoryGroup.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${activeStoryGroup.username}`} style={{width: '32px', height: '32px', borderRadius: '50%'}} alt="" />
                    <span style={{fontWeight: '700'}}>{activeStoryGroup.display_name || activeStoryGroup.username}</span>
                  </div>
                  <div style={{flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                    {activeStoryGroup.stories[0].type === 'voice' ? (
                      <div style={{textAlign: 'center'}}>
                        <div style={{fontSize: '48px'}}>🎙️</div>
                        <p>Voice Flash</p>
                      </div>
                    ) : (
                      <img src={activeStoryGroup.stories[0].media_url} style={{width: '100%', height: '100%', objectFit: 'contain'}} alt="" />
                    )}
                  </div>
               </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
