import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { Search as SearchIcon, Globe, Heart, MessageCircle, X, Clock, ShieldCheck, TrendingUp, Sparkles, UserPlus } from 'lucide-react';
import { getModelImage } from '../constants/models';

interface SearchProps {
  onSelectUser: (userId: string) => void;
  onSelectCapsule: (capsule: any) => void;
}

export const Search: React.FC<SearchProps> = ({ onSelectUser, onSelectCapsule }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{users: any[], capsules: any[]}>({users: [], capsules: []});
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<any[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('recent_searches');
    if (saved) setRecentSearches(JSON.parse(saved));
  }, []);

  const saveSearch = (item: any) => {
    const newRecent = [item, ...recentSearches.filter(i => i.id !== item.id)].slice(0, 8);
    setRecentSearches(newRecent);
    localStorage.setItem('recent_searches', JSON.stringify(newRecent));
  };

  const clearSearches = () => {
    setRecentSearches([]);
    localStorage.removeItem('recent_searches');
  };

  const handleSearch = async (val: string) => {
    setQuery(val);
    if (val.length < 2) {
      setResults({users: [], capsules: []});
      return;
    }

    setLoading(true);
    try {
      const { data: users } = await supabase
        .from('profiles')
        .select('*')
        .or(`username.ilike.%${val}%,display_name.ilike.%${val}%`)
        .limit(6);

      const { data: capsules } = await supabase
        .from('capsules')
        .select('*, profiles:owner_id(username, avatar_url, display_name)')
        .ilike('title', `%${val}%`)
        .eq('is_public', true)
        .limit(12);

      setResults({ users: users || [], capsules: capsules || [] });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="search-view-premium">
      <div className="search-hero-banner">
         <div className="search-bar-premium">
            <SearchIcon size={24} color="var(--primary)" />
            <input 
              type="text" 
              placeholder="Explore capsules, users, or themes..." 
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              autoFocus
            />
            {query.length > 0 && (
              <button onClick={() => handleSearch('')} className="search-clear-btn">
                 <X size={18} />
              </button>
            )}
         </div>
      </div>

      <div className="search-content-premium">
        {loading ? (
          <div className="search-loader-area">
             <div className="loader"></div>
             <p>Searching Kapsely Universe...</p>
          </div>
        ) : query.length > 0 ? (
          <div className="search-results-layout">
            <AnimatePresence mode="wait">
              <motion.div 
                key="results"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="results-container"
              >
                {results.users.length > 0 && (
                  <section className="results-section-premium">
                    <div className="section-title-premium">
                       <UserPlus size={18} /> <h3>Accounts</h3>
                    </div>
                    <div className="users-flex-row">
                      {results.users.map(u => (
                        <div key={u.id} className="user-card-premium" onClick={() => { saveSearch(u); onSelectUser(u.id); }}>
                          <img src={u.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.username}`} className="user-avatar-md" alt="" />
                          <div className="user-card-info">
                            <div className="user-card-name">
                               <strong>{u.display_name || u.username}</strong>
                               {u.is_verified && <ShieldCheck size={12} color="var(--primary)" fill="var(--primary-light)" />}
                            </div>
                            <span>@{u.username}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                <section className="results-section-premium">
                  <div className="section-title-premium">
                     <Sparkles size={18} /> <h3>Memories & Capsules</h3>
                  </div>
                  {results.capsules.length > 0 ? (
                    <div className="search-grid-premium">
                      {results.capsules.map((cap, idx) => (
                        <motion.div 
                          key={cap.id}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: idx * 0.05 }}
                          className="search-cap-card-premium"
                          onClick={() => onSelectCapsule(cap)}
                        >
                          <div className="cap-card-visual" style={{ background: cap.status === 'sealed' ? '#1a1530' : '#f8f7ff' }}>
                             <img src={getModelImage(cap.model)} alt="" />
                             <div className="cap-card-overlay-sm">
                                <div className="overlay-badge-sm">{cap.status}</div>
                             </div>
                          </div>
                          <div className="cap-card-body">
                             <h4>{cap.title}</h4>
                             <div className="cap-card-meta-sm">
                                <div className="cap-meta-item"><Heart size={12} /> {cap.likes_count || 0}</div>
                                <div className="cap-meta-item"><MessageCircle size={12} /> {cap.comments_count || 0}</div>
                             </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <div className="search-no-results">
                      <p>We couldn't find any capsules matching "<strong>{query}</strong>"</p>
                    </div>
                  )}
                </section>
              </motion.div>
            </AnimatePresence>
          </div>
        ) : (
          <div className="search-landing-premium">
            {recentSearches.length > 0 && (
              <div className="recent-searches-premium">
                <div className="recent-header-row">
                   <h3>RECENT SEARCHES</h3>
                   <button onClick={clearSearches}>CLEAR ALL</button>
                </div>
                <div className="recent-pills-row">
                   {recentSearches.map(item => (
                     <div key={item.id} className="recent-pill-premium" onClick={() => onSelectUser(item.id)}>
                        <Clock size={14} />
                        <span>{item.display_name || item.username}</span>
                        <button className="pill-remove-btn" onClick={(e) => { e.stopPropagation(); setRecentSearches(recentSearches.filter(i => i.id !== item.id)); }}><X size={12} /></button>
                     </div>
                   ))}
                </div>
              </div>
            )}
            
            <div className="search-explore-grid">
               <div className="explore-card-lg trending">
                  <TrendingUp size={32} />
                  <h3>Trending Now</h3>
                  <p>Discover capsules that are capturing the world's attention.</p>
               </div>
               <div className="explore-card-lg discover">
                  <Globe size={32} />
                  <h3>Global Memories</h3>
                  <p>Explore public time capsules from creators around the globe.</p>
               </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .search-view-premium { width: 100%; max-width: 1000px; margin: 0 auto; padding-bottom: 100px; }
        
        .search-hero-banner { padding: 60px 20px; display: flex; justify-content: center; }
        .search-bar-premium { width: 100%; max-width: 800px; background: white; border-radius: 100px; padding: 20px 35px; display: flex; align-items: center; gap: 20px; border: 2px solid var(--border); box-shadow: 0 20px 50px rgba(124, 92, 191, 0.08); transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
        .search-bar-premium:focus-within { border-color: var(--primary); box-shadow: 0 25px 60px rgba(124, 92, 191, 0.15); transform: translateY(-2px); }
        .search-bar-premium input { flex: 1; border: none; outline: none; font-size: 1.3rem; font-weight: 600; font-family: inherit; color: var(--text); }
        .search-clear-btn { width: 32px; height: 32px; border-radius: 50%; background: var(--surface-alt); display: flex; align-items: center; justify-content: center; color: var(--text-muted); }

        .search-content-premium { padding: 0 20px; }
        .search-loader-area { padding: 100px 0; text-align: center; color: var(--text-muted); }
        
        .results-section-premium { margin-bottom: 60px; }
        .section-title-premium { display: flex; align-items: center; gap: 10px; margin-bottom: 25px; color: var(--text); }
        .section-title-premium h3 { font-size: 18px; font-weight: 900; letter-spacing: -0.5px; margin: 0; text-transform: uppercase; }

        .users-flex-row { display: flex; flex-wrap: wrap; gap: 15px; }
        .user-card-premium { display: flex; align-items: center; gap: 15px; padding: 12px 20px; background: white; border: 1px solid var(--border); border-radius: 20px; cursor: pointer; transition: all 0.2s; }
        .user-card-premium:hover { border-color: var(--primary); transform: translateY(-3px); box-shadow: 0 10px 20px rgba(124, 92, 191, 0.05); }
        .user-avatar-md { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; }
        .user-card-name { display: flex; align-items: center; gap: 5px; }
        .user-card-name strong { font-size: 15px; font-weight: 800; }
        .user-card-info span { font-size: 13px; color: var(--text-muted); font-weight: 600; }

        .search-grid-premium { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 25px; }
        .search-cap-card-premium { background: white; border-radius: 28px; overflow: hidden; border: 1px solid var(--border); cursor: pointer; transition: all 0.3s; }
        .search-cap-card-premium:hover { transform: translateY(-8px); box-shadow: var(--shadow-lg); }
        .cap-card-visual { aspect-ratio: 1.1; display: flex; align-items: center; justify-content: center; position: relative; }
        .cap-card-visual img { width: 70%; height: 70%; object-fit: contain; filter: drop-shadow(0 15px 30px rgba(0,0,0,0.12)); }
        .cap-card-overlay-sm { position: absolute; top: 15px; right: 15px; }
        .overlay-badge-sm { background: rgba(255,255,255,0.9); backdrop-filter: blur(5px); padding: 5px 12px; border-radius: 10px; font-size: 10px; font-weight: 900; text-transform: uppercase; color: var(--primary); }

        .cap-card-body { padding: 18px 20px; }
        .cap-card-body h4 { font-size: 16px; font-weight: 800; margin-bottom: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cap-card-meta-sm { display: flex; gap: 15px; color: var(--text-muted); font-size: 12px; font-weight: 700; }
        .cap-meta-item { display: flex; align-items: center; gap: 6px; }

        .recent-searches-premium { margin-bottom: 60px; }
        .recent-header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .recent-header-row h3 { font-size: 13px; font-weight: 900; color: var(--text-muted); letter-spacing: 1.5px; }
        .recent-header-row button { font-size: 13px; font-weight: 800; color: var(--primary); }

        .recent-pills-row { display: flex; flex-wrap: wrap; gap: 12px; }
        .recent-pill-premium { display: flex; align-items: center; gap: 10px; padding: 10px 20px; background: white; border: 1px solid var(--border); border-radius: 100px; cursor: pointer; font-size: 14px; font-weight: 700; transition: all 0.2s; }
        .recent-pill-premium:hover { border-color: var(--primary); background: var(--primary-light); color: var(--primary); }
        .pill-remove-btn { color: var(--text-muted); margin-left: 5px; }

        .search-explore-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 40px; }
        .explore-card-lg { padding: 40px; border-radius: 32px; color: white; display: flex; flex-direction: column; gap: 15px; transition: transform 0.3s; cursor: pointer; }
        .explore-card-lg:hover { transform: scale(1.02); }
        .explore-card-lg.trending { background: linear-gradient(135deg, #7C5CBF 0%, #FF4D8D 100%); box-shadow: 0 20px 40px rgba(124, 92, 191, 0.2); }
        .explore-card-lg.discover { background: linear-gradient(135deg, #3B82F6 0%, #10B981 100%); box-shadow: 0 20px 40px rgba(59, 130, 246, 0.2); }
        .explore-card-lg h3 { font-size: 24px; font-weight: 900; margin: 0; }
        .explore-card-lg p { font-size: 15px; opacity: 0.9; line-height: 1.5; margin: 0; }
      `}</style>
    </div>
  );
};
