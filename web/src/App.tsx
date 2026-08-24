import React, { useCallback, useEffect, useRef, useState } from 'react';
import { safeLocalSignOut, safeSignOut, supabase } from './lib/supabase';
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
  Share2,
  RefreshCw,
  Sparkles,
  Images,
  Smartphone,
  X
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
import { Sliders, ShieldCheck } from 'lucide-react';
import { AdminPanel } from './components/AdminPanel';
import VerifiedBadge from './components/VerifiedBadge';
import { rankWebFeed } from './utils/feedRanking';

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

const getSharedCapsuleIdFromPath = () => {
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(/^\/capsules\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
};

const CapsuleShareFallback = ({ capsuleId }: { capsuleId: string }) => {
  const appLink = `kapsely://capsules/${encodeURIComponent(capsuleId)}`;
  const playStoreLink = 'https://play.google.com/store/apps/details?id=com.kapsely.app';
  const appStoreLink = 'https://apps.apple.com/search?term=Kapsely';

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.location.href = appLink;
    }, 350);
    return () => window.clearTimeout(timer);
  }, [appLink]);

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: 'radial-gradient(circle at top, #F1E9FF 0, #FFFFFF 48%, #F8F7FF 100%)' }}>
      <div style={{ width: '100%', maxWidth: 460, textAlign: 'center', background: 'rgba(255,255,255,0.82)', border: '1px solid rgba(124,92,191,0.18)', borderRadius: 28, padding: 28, boxShadow: '0 28px 80px rgba(55,37,109,0.16)' }}>
        <img src="https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/website/Logomain.png" alt="Kapsely" style={{ width: 72, height: 72, objectFit: 'contain', margin: '0 auto 14px' }} />
        <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1, color: '#1A1530' }}>kapsely</h1>
        <p style={{ margin: '14px 0 24px', color: '#5C5778', fontSize: 16, lineHeight: 1.5 }}>Abre esta capsula en la app para verla completa.</p>
        <div style={{ display: 'grid', gap: 12 }}>
          <a href={appLink} style={{ display: 'block', padding: '14px 18px', borderRadius: 16, background: '#7C5CBF', color: '#fff', fontWeight: 800, textDecoration: 'none' }}>Abrir en Kapsely</a>
          <a href={playStoreLink} style={{ display: 'block', padding: '13px 18px', borderRadius: 16, background: '#1A1530', color: '#fff', fontWeight: 700, textDecoration: 'none' }}>Google Play</a>
          <a href={appStoreLink} style={{ display: 'block', padding: '13px 18px', borderRadius: 16, background: '#FFFFFF', color: '#1A1530', fontWeight: 700, textDecoration: 'none', border: '1px solid #EAE6F5' }}>App Store</a>
        </div>
      </div>
    </div>
  );
};

function App() {
  const SIMPLE_FRONTEND_FEED = true;
  const SIMPLE_FRONTEND_PROFILE = true;
  const DISABLE_FEED_METRICS_UNTIL_STABLE = false;
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
  const sharedCapsuleIdFromPath = getSharedCapsuleIdFromPath();
  const feedSessionId = useRef(`web-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const feedRpcPreference = useRef<'unknown' | 'v2' | 'v1'>('unknown');
  const fetchSeq = useRef(0);
  const PAGE_SIZE = 15;

  const withTimeout = <T,>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
      Promise.resolve(promise)
        .then(value => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });

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
    withTimeout(supabase.auth.getSession(), 1500, 'web getSession')
      .then(result => {
        setSession(result?.data?.session ?? null);
        setAuthChecking(false);
      })
      .catch(() => {
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

  useEffect(() => {
    if (!session?.user?.id || !sharedCapsuleIdFromPath) return;
    let cancelled = false;
    supabase
      .from('capsules')
      .select('*, profiles:owner_id(id, username, display_name, avatar_url, favorite_color, is_verified)')
      .eq('id', sharedCapsuleIdFromPath)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setSelectedCapsule(data);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, sharedCapsuleIdFromPath]);

  const fetchUserProfile = async (userId: string) => {
    if (SIMPLE_FRONTEND_PROFILE) {
      const [profileRes, followersRes, followingRes, capsulesRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', userId),
        supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', userId),
        supabase.from('capsules').select('id', { count: 'exact', head: true }).eq('owner_id', userId),
      ]);

      if (profileRes.data) {
        setUserProfile({
          ...profileRes.data,
          followers_count: followersRes.count || 0,
          following_count: followingRes.count || 0,
          capsules_count: capsulesRes.count || 0,
        });
      }
      return;
    }

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
    if (DISABLE_FEED_METRICS_UNTIL_STABLE) return;
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
    if (DISABLE_FEED_METRICS_UNTIL_STABLE) return;
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

      if (SIMPLE_FRONTEND_FEED && session?.user?.id) {
        const myId = session.user.id;
        const statusFilter = activeFilter === 'opened' ? 'opened' : activeFilter === 'sealed' ? 'sealed' : null;
        const candidateLimit = PAGE_SIZE * (isLoadMore ? 6 : 4);

        const [followingRes, followedCapsulesRes, participantRes, impressionsRes] = await Promise.all([
          supabase.from('follows').select('following_id').eq('follower_id', myId),
          supabase.from('capsule_followers').select('capsule_id').eq('user_id', myId),
          supabase.from('capsule_invites').select('capsule_id').eq('user_id', myId).eq('status', 'accepted'),
          supabase.from('feed_impressions').select('capsule_id').eq('user_id', myId).gte('shown_at', new Date(Date.now() - 7 * 86400000).toISOString()).limit(400),
        ]);

        const followingIds = (followingRes.data || []).map((row: any) => row.following_id);
        const followedCapsuleIds = (followedCapsulesRes.data || []).map((row: any) => row.capsule_id);
        const participantCapsuleIds = (participantRes.data || []).map((row: any) => row.capsule_id);
        const seenCapsuleIds = (impressionsRes.data || []).map((row: any) => row.capsule_id).filter(Boolean);

        let capsuleRows: any[] = [];
        if (feedTab === 'following') {
          const ownerIds = Array.from(new Set([myId, ...followingIds]));
          const ownerQuery = ownerIds.length
            ? supabase
                .from('capsules')
                .select('*, profiles:owner_id(id, username, display_name, avatar_url, favorite_color, is_verified)')
                .in('owner_id', ownerIds)
                .order('updated_at', { ascending: false })
                .limit(candidateLimit)
            : Promise.resolve({ data: [] } as any);

          const followedQuery = followedCapsuleIds.length
            ? supabase
                .from('capsules')
                .select('*, profiles:owner_id(id, username, display_name, avatar_url, favorite_color, is_verified)')
                .in('id', followedCapsuleIds)
                .order('updated_at', { ascending: false })
                .limit(candidateLimit)
            : Promise.resolve({ data: [] } as any);

          const [ownerCapsules, followedCapsules] = await Promise.all([ownerQuery, followedQuery]);
          const merged = [...(ownerCapsules.data || []), ...(followedCapsules.data || [])];
          capsuleRows = Array.from(new Map(merged.map((item: any) => [item.id, item])).values());
        } else {
          const exploreRes = await supabase
            .from('capsules')
            .select('*, profiles:owner_id(id, username, display_name, avatar_url, favorite_color, is_verified)')
            .eq('is_public', true)
            .neq('owner_id', myId)
            .order('updated_at', { ascending: false })
            .limit(candidateLimit);
          capsuleRows = exploreRes.data || [];
        }

        if (statusFilter) {
          capsuleRows = capsuleRows.filter((capsule: any) => capsule.status === statusFilter);
        }

        const capsuleIds = capsuleRows.map((capsule: any) => capsule.id);
        const [mediaRes, likesRes, commentsRes, membersRes] = capsuleIds.length
          ? await Promise.all([
              supabase
                .from('capsule_items')
                .select('id, capsule_id, owner_id, media_url, media_type, thumbnail_url, created_at, profiles:owner_id(id, username, display_name, avatar_url, favorite_color, is_verified)')
                .in('capsule_id', capsuleIds)
                .eq('is_story', false)
                .neq('moderation_status', 'rejected')
                .in('media_type', ['image', 'video'])
                .order('created_at', { ascending: false }),
              supabase
                .from('likes')
                .select('capsule_id, user_id')
                .in('capsule_id', capsuleIds),
              supabase
                .from('comments')
                .select('capsule_id')
                .in('capsule_id', capsuleIds),
              supabase
                .from('capsule_invites')
                .select('capsule_id, user_id, status, profiles:user_id(id, username, display_name, avatar_url, favorite_color, is_verified)')
                .in('capsule_id', capsuleIds)
                .eq('status', 'accepted'),
            ])
          : [
              { data: [] as any[] },
              { data: [] as any[] },
              { data: [] as any[] },
              { data: [] as any[] },
            ];

        const mediaByCapsule = new Map<string, any[]>();
        (mediaRes.data || []).forEach((item: any) => {
          const list = mediaByCapsule.get(item.capsule_id) || [];
          if (list.length < 4) list.push(item);
          mediaByCapsule.set(item.capsule_id, list);
        });

        const countByCapsule = (rows: any[]) => {
          const counts = new Map<string, number>();
          rows.forEach((row: any) => {
            if (!row?.capsule_id) return;
            counts.set(row.capsule_id, (counts.get(row.capsule_id) || 0) + 1);
          });
          return counts;
        };

        const likesByCapsule = countByCapsule(likesRes.data || []);
        const commentsByCapsule = countByCapsule(commentsRes.data || []);
        const likedIds = new Set(
          (likesRes.data || [])
            .filter((like: any) => like.user_id === myId)
            .map((like: any) => like.capsule_id)
            .filter(Boolean)
        );
        const membersByCapsule = new Map<string, any[]>();
        capsuleRows.forEach((capsule: any) => {
          if (capsule?.id && capsule.profiles) {
            membersByCapsule.set(capsule.id, [{ ...capsule.profiles, id: capsule.owner_id, role: 'owner' }]);
          }
        });
        (membersRes.data || []).forEach((member: any) => {
          if (!member?.capsule_id || !member?.profiles) return;
          const list = membersByCapsule.get(member.capsule_id) || [];
          if (!list.some((profile: any) => profile.id === member.user_id)) {
            list.push({ ...member.profiles, id: member.user_id, role: 'member' });
          }
          membersByCapsule.set(member.capsule_id, list);
        });

        const mappedFeed = capsuleRows
          .map((capsule: any) => {
            const media = mediaByCapsule.get(capsule.id) || [];
            const activityDate = media[0]?.created_at || capsule.updated_at || capsule.created_at;
            const score =
              (capsule.owner_id === myId ? 70 : 0) +
              (followingIds.includes(capsule.owner_id) ? 45 : 0) +
              (followedCapsuleIds.includes(capsule.id) ? 55 : 0) +
              (capsule.status === 'opened' ? 30 : 10) +
              Math.min(media.length * 5, 20);

            return {
              ...capsule,
              id: `web-simple:${capsule.id}`,
              feed_item_key: `web-simple:${capsule.id}`,
              feed_event_id: `web-simple:${capsule.id}`,
              capsule_id: capsule.id,
              event_type: capsule.status === 'opened' ? 'capsule_opened' : 'capsule_created',
              latest_item: media[0] || null,
              collage_items: media,
              posts_count: media.length,
              likes_count: likesByCapsule.get(capsule.id) || 0,
              comments_count: commentsByCapsule.get(capsule.id) || 0,
              is_liked: likedIds.has(capsule.id),
              shared_members: membersByCapsule.get(capsule.id) || [],
              participants_count: membersByCapsule.get(capsule.id)?.length || 1,
              is_followed_capsule: followedCapsuleIds.includes(capsule.id),
              final_score: score,
              activity_date: activityDate,
            };
          });

        const rankedFeed = rankWebFeed(mappedFeed, {
          tab: feedTab,
          viewerId: myId,
          followingIds: new Set(followingIds),
          followedCapsuleIds: new Set(followedCapsuleIds),
          participantCapsuleIds: new Set(participantCapsuleIds),
          seenCapsuleIds: new Set(seenCapsuleIds),
          seed: feedSessionId.current,
        });

        if (seq !== fetchSeq.current) return;

        const visibleCount = isLoadMore ? Math.min(feed.length + PAGE_SIZE, rankedFeed.length) : PAGE_SIZE;
        const visibleFeed = rankedFeed.slice(0, visibleCount);
        setFeed(visibleFeed);
        setFeedCursor(null);
        setHasNextPage(rankedFeed.length > visibleFeed.length);
        recordImpressions(visibleFeed.slice(isLoadMore ? feed.length : 0), isLoadMore ? feed.length : 0).catch(() => {});

        setStories([]);
        setMyStory(null);
        return;
      }

      const cursor = isLoadMore ? feedCursor : null;
      const effectiveMode = isLoadMore ? 'infinite_scroll' : refreshMode;

      const rpcParams = {
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
      };

      let data: any = null;
      let error: any = null;

      if (feedRpcPreference.current !== 'v1') {
        const ranked = await supabase.rpc('get_combined_feed_data_v2', rpcParams);
        data = ranked.data;
        error = ranked.error;

        const missingV2 =
          typeof error?.message === 'string' &&
          error.message.includes('get_combined_feed_data_v2') &&
          (
            error.message.includes('Could not find the function') ||
            error.message.includes('does not exist') ||
            error.message.includes('schema cache')
          );

        if (!error) {
          feedRpcPreference.current = 'v2';
        } else if (missingV2) {
          feedRpcPreference.current = 'v1';
        }
      }

      if (!data || error) {
        const legacy = await supabase.rpc('get_combined_feed_data', rpcParams);
        data = legacy.data;
        error = legacy.error;
      }

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

  const dashboardStats = {
    total: feed.length,
    opened: feed.filter(item => item.status === 'opened').length,
    sealed: feed.filter(item => item.status === 'sealed').length,
    stories: stories.reduce((sum, group) => sum + (group.stories?.length || 0), myStory?.stories?.length || 0),
  };

  if (authChecking) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F7FF' }}>
        <div className="loader"></div>
      </div>
    );
  }

  if (!session && sharedCapsuleIdFromPath) {
    return <CapsuleShareFallback capsuleId={sharedCapsuleIdFromPath} />;
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
    
    const hasMedia = !isClosed && !!(capsule.cover_url || (capsule.collage_items && capsule.collage_items.length > 0));
    
    const openCapsule = async () => {
      await recordFeedOpen(capsule).catch(() => {});
      setSelectedCapsule(capsule);
    };

    const toggleLike = async (event: React.MouseEvent) => {
      event.stopPropagation();
      if (!session?.user?.id) return;
      const capsuleId = capsule.capsule_id || capsule.id?.replace?.('web-simple:', '') || capsule.id;
      const wasLiked = !!capsule.is_liked;
      setFeed(prev => prev.map(item => {
        const itemCapsuleId = item.capsule_id || item.id?.replace?.('web-simple:', '') || item.id;
        if (itemCapsuleId !== capsuleId) return item;
        return {
          ...item,
          is_liked: !wasLiked,
          likes_count: Math.max(0, (item.likes_count || 0) + (wasLiked ? -1 : 1)),
        };
      }));

      try {
        if (wasLiked) {
          await supabase.from('likes').delete().eq('capsule_id', capsuleId).eq('user_id', session.user.id);
        } else {
          await supabase.from('likes').insert({ capsule_id: capsuleId, user_id: session.user.id });
        }
      } catch (error) {
        setFeed(prev => prev.map(item => {
          const itemCapsuleId = item.capsule_id || item.id?.replace?.('web-simple:', '') || item.id;
          if (itemCapsuleId !== capsuleId) return item;
          return {
            ...item,
            is_liked: wasLiked,
            likes_count: Math.max(0, (item.likes_count || 0) + (wasLiked ? 1 : -1)),
          };
        }));
      }
    };

    const shareCapsule = async (event: React.MouseEvent) => {
      event.stopPropagation();
      const capsuleId = capsule.capsule_id || capsule.id?.replace?.('web-simple:', '') || capsule.id;
      const url = `https://kapsely.com/capsules/${encodeURIComponent(capsuleId)}`;
      try {
        if (navigator.share) {
          await navigator.share({ title: capsule.title || 'Kapsely', text: 'Mira esta capsula en Kapsely', url });
        } else {
          await navigator.clipboard.writeText(url);
          alert('Link copied to clipboard');
        }
      } catch {}
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
          className={`card-media-container ${isClosed ? 'sealed-card-media' : ''}`}
          style={{ backgroundColor: isClosed ? '#f8f7ff' : '#f8f7ff', position: 'relative', height: '280px', overflow: 'hidden' }}
          onContextMenu={e => e.preventDefault()}
        >
          {!isClosed && (
            <>
              <div className="type-badge-floating" style={{ backgroundColor: cfg.color, position: 'absolute', top: '12px', left: '12px', zIndex: 12, display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '20px', fontSize: '10px', color: 'white', fontWeight: 'bold' }}>
                <TypeIcon size={12} color="white" />
                <span>{cfg.label}</span>
              </div>
              <div className="status-badge-floating" style={{ position: 'absolute', bottom: '12px', right: '12px', zIndex: 12, backgroundColor: '#4ADE80', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid white' }}>
                 <Unlock size={12} color="white" />
              </div>
            </>
          )}

          <div className="model-glow" />

          {isClosed ? (
            <div className="center-model-view sealed-card-model">
               <CapsuleWithTimer 
                 modelKey={capsule.model}
                 source={getModelImage(capsule.model)}
                 date={capsule.opens_at}
                 modelLayout={capsule.model_snapshot}
                 chainId={capsule.chain_id}
                 style={{ width: '230px', height: '230px' }}
                 isOpened={false}
                 lightweight={true}
               />
            </div>
          ) : hasMedia ? (
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
                        item.media_type === 'video' ? (
                          <div key={i} className="web-video-tile">
                            <video
                              src={item.media_url}
                              poster={item.thumbnail_url || undefined}
                              muted
                              playsInline
                              preload="metadata"
                            />
                            <span className="video-play-badge">▶</span>
                          </div>
                        ) : (
                          <img 
                            key={i} 
                            src={item.thumbnail_url || item.media_url} 
                            style={{ width: '100%', height: '100%', objectFit: 'cover', border: '1px solid white' }} 
                            alt="" 
                            draggable={false}
                          />
                        )
                      ))}
                    </div>
                  )}
              </div>

              {/* Security Overlay */}
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
            <button className="action-btn" onClick={toggleLike}><Heart size={22} fill={capsule.is_liked ? "var(--secondary)" : "none"} color={capsule.is_liked ? "var(--secondary)" : "currentColor"} /> <span>{capsule.likes_count || 0}</span></button>
            <button className="action-btn" onClick={(event) => { event.stopPropagation(); openCapsule(); }}><MessageCircle size={22} /> <span>{capsule.comments_count || 0}</span></button>
            <button className="action-btn" style={{marginLeft: 'auto'}} onClick={shareCapsule}><Share2 size={22} /></button>
          </div>
          <div className="card-content">
            {capsule.ranking_reason && (
              <span className="ranking-reason"><Sparkles size={12} /> {capsule.ranking_reason}</span>
            )}
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
          <span className="brand-orbit"><Clock size={18} /></span>
          <span className="brand-copy"><strong>Kapsely</strong><small>Recuerdos con futuro</small></span>
        </div>
        
        <div className="sidebar-nav">
          <span className="nav-section-label">Descubrir</span>
          <button 
            className={`nav-item ${activeView === 'feed' && feedTab === 'following' && !viewingProfileId ? 'active' : ''}`} 
            onClick={() => { setActiveView('feed'); setFeedTab('following'); setViewingProfileId(null); }}
          >
            <Home size={22} /> <span>Inicio</span>
          </button>

          <button
            className={`nav-item ${activeView === 'feed' && feedTab === 'explore' && !viewingProfileId ? 'active' : ''}`}
            onClick={() => { setActiveView('feed'); setFeedTab('explore'); setViewingProfileId(null); }}
          >
            <Compass size={22} /> <span>Explorar</span>
          </button>

          <button
            className={`nav-item ${activeView === 'search' ? 'active' : ''}`}
            onClick={() => { setActiveView('search'); setViewingProfileId(null); }}
          >
            <Search size={22} /> <span>Buscar</span>
          </button>

          <span className="nav-section-label">Tu espacio</span>
          <button 
            className={`nav-item ${activeView === 'chat' ? 'active' : ''}`} 
            onClick={() => { setActiveView('chat'); setViewingProfileId(null); }}
          >
            <MessageCircle size={22} /> <span>Mensajes</span>
          </button>

          <button 
            className={`nav-item ${activeView === 'notifications' ? 'active' : ''}`} 
            onClick={() => { setActiveView('notifications'); setViewingProfileId(null); }}
          >
            <Bell size={22} /> <span>Actividad</span>
          </button>

          <button 
            className={`nav-item create-btn-sidebar ${activeView === 'create' ? 'active' : ''}`} 
            onClick={() => { setActiveView('create'); setViewingProfileId(null); }}
          >
            <div className="create-icon-wrapper"><Plus size={22} /></div>
            <span>Nueva cápsula</span>
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
            <span>Perfil</span>
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
          <button className="nav-item logout-item" onClick={() => safeSignOut()}>
            <LogOut size={20} /> <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <div className="desktop-topbar">
          <div>
            <span className="topbar-kicker">Tu cápsula del día</span>
            <h1>{viewingProfileId ? 'Perfil' : activeView === 'feed' ? (feedTab === 'following' ? 'Inicio' : 'Explorar') : activeView === 'search' ? 'Buscar' : activeView === 'chat' ? 'Mensajes' : activeView === 'notifications' ? 'Actividad' : activeView.charAt(0).toUpperCase() + activeView.slice(1)}</h1>
          </div>
          <div className="topbar-actions">
            <button className="topbar-btn" onClick={() => { setActiveView('search'); setViewingProfileId(null); }}><Search size={18} /> Search</button>
            <button className="topbar-primary" onClick={() => { setActiveView('create'); setViewingProfileId(null); }}><Plus size={18} /> New capsule</button>
          </div>
        </div>
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
                  <div className={`feed-intro-card ${feedTab === 'explore' ? 'is-explore' : ''}`}>
                    <div>
                      <span className="feed-intro-eyebrow"><Sparkles size={14} /> {feedTab === 'explore' ? 'Descubrimiento personalizado' : 'Tu círculo, en orden inteligente'}</span>
                      <h2>{feedTab === 'explore' ? 'Encuentra recuerdos fuera de tu burbuja' : 'Lo importante, sin perderte nada'}</h2>
                      <p>{feedTab === 'explore' ? 'Mezclamos afinidad, frescura y calidad con espacio para nuevos creadores.' : 'Priorizamos a quienes sigues, tus cápsulas y la actividad que todavía no has visto.'}</p>
                    </div>
                    <div className="algorithm-badge"><span></span> Ranking activo</div>
                  </div>
                  <div className="feed-tabs">
                    <button className={`feed-tab-item ${feedTab === 'following' ? 'active' : ''}`} onClick={() => setFeedTab('following')}>Siguiendo</button>
                    <button className={`feed-tab-item ${feedTab === 'explore' ? 'active' : ''}`} onClick={() => setFeedTab('explore')}>Para ti</button>
                    <button className="feed-refresh-btn" onClick={() => fetchFeed(false, 'pull_to_refresh')} disabled={refreshing || loading}>
                      <RefreshCw size={16} className={refreshing ? 'spin-icon' : ''} />
                      {refreshing ? 'Actualizando...' : 'Actualizar'}
                    </button>
                  </div>

                  <div className="filter-chips">
                    <button className={`chip ${activeFilter === 'all' ? 'active' : ''}`} onClick={() => setActiveFilter('all')}>Todo</button>
                    <button className={`chip ${activeFilter === 'opened' ? 'active' : ''}`} onClick={() => setActiveFilter('opened')}>Abiertas</button>
                    <button className={`chip ${activeFilter === 'sealed' ? 'active' : ''}`} onClick={() => setActiveFilter('sealed')}>Selladas</button>
                  </div>
                </header>

                {loading ? (
                  <div className="loading-state"><div className="loader"></div></div>
                ) : feed.length === 0 ? (
                  <div className="web-empty-state">
                    <Sparkles size={34} />
                    <h3>No hay capsulas aqui todavia</h3>
                    <p>Cambia de filtro, explora capsulas publicas o crea una nueva desde la web.</p>
                    <button className="topbar-primary" onClick={() => setActiveView('create')}><Plus size={18} /> Crear capsula</button>
                  </div>
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
                <div className="sidebar-section feed-health-card">
                  <div className="feed-health-head"><span>Tu feed ahora</span><Sparkles size={16} /></div>
                  <div className="stats-grid">
                    <div><strong>{dashboardStats.total}</strong><span>historias</span></div>
                    <div><strong>{dashboardStats.opened}</strong><span>abiertas</span></div>
                  </div>
                  <p>Orden adaptado por afinidad, actividad reciente y variedad.</p>
                </div>
                <div className="sidebar-section">
                  <h3 className="section-title">Personas que inspiran</h3>
                  {suggestions.length === 0 && <p className="empty-side-note">Sin sugerencias por ahora.</p>}
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
                 <div className="web-empty-state chat-empty">
                   <MessageCircle size={36} />
                   <h3>Selecciona un chat</h3>
                   <p>El panel de mensajes se queda abierto para trabajar comodo desde ordenador.</p>
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
                        <div style={{fontSize: '48px'}}>ðŸŽ™ï¸</div>
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
