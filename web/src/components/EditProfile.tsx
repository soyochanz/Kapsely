import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Camera, Save, User, FileText, MapPin, AtSign, Link as LinkIcon, Globe } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface EditProfileProps {
  profile: any;
  onClose: () => void;
  onUpdate: () => void;
}

export const EditProfile: React.FC<EditProfileProps> = ({ profile, onClose, onUpdate }) => {
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [location, setLocation] = useState(profile?.location || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    try {
      setLoading(true);
      setError(null);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          display_name: displayName,
          bio,
          location,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.id);

      if (updateError) throw updateError;
      
      onUpdate();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="edit-profile-overlay" onClick={onClose}>
      <motion.div 
        initial={{ y: 50, scale: 0.9, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 50, scale: 0.9, opacity: 0 }}
        className="edit-profile-modal-premium"
        onClick={e => e.stopPropagation()}
      >
        <header className="edit-modal-header">
           <div className="header-text">
              <h2>Edit Profile</h2>
              <p>Keep your digital identity fresh and inspiring.</p>
           </div>
           <button className="close-circle-btn" onClick={onClose}><X /></button>
        </header>

        <div className="edit-modal-body">
           <div className="avatar-edit-preview-section">
              <div className="avatar-glow-wrap">
                 <img src={avatarUrl || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + profile?.username} alt="" />
                 <button className="avatar-camera-btn"><Camera size={20} /></button>
              </div>
              <div className="avatar-controls">
                 <label>AVATAR URL</label>
                 <input 
                   type="text" 
                   value={avatarUrl} 
                   placeholder="https://example.com/photo.jpg" 
                   onChange={e => setAvatarUrl(e.target.value)}
                 />
              </div>
           </div>

           <div className="edit-form-premium">
              <div className="form-row-two">
                 <div className="premium-input-group">
                    <label><User size={16} /> DISPLAY NAME</label>
                    <input 
                      type="text" 
                      value={displayName} 
                      onChange={e => setDisplayName(e.target.value)}
                      placeholder="e.g. John Doe"
                    />
                 </div>
                 <div className="premium-input-group">
                    <label><AtSign size={16} /> USERNAME</label>
                    <input 
                      type="text" 
                      value={profile?.username} 
                      disabled
                      style={{ opacity: 0.5, cursor: 'not-allowed' }}
                    />
                 </div>
              </div>

              <div className="premium-input-group">
                 <label><FileText size={16} /> BIO</label>
                 <textarea 
                   value={bio} 
                   onChange={e => setBio(e.target.value)}
                   placeholder="Tell your story in a few words..."
                   rows={3}
                 />
              </div>

              <div className="form-row-two">
                 <div className="premium-input-group">
                    <label><MapPin size={16} /> LOCATION</label>
                    <input 
                      type="text" 
                      value={location} 
                      onChange={e => setLocation(e.target.value)}
                      placeholder="e.g. Tokyo, Japan"
                    />
                 </div>
                 <div className="premium-input-group">
                    <label><Globe size={16} /> WEBSITE</label>
                    <input 
                      type="text" 
                      placeholder="https://yourlink.com"
                      disabled
                    />
                 </div>
              </div>
           </div>
        </div>

        {error && <div className="edit-error-banner">{error}</div>}

        <footer className="edit-modal-footer">
           <button className="cancel-profile-btn" onClick={onClose}>Discard Changes</button>
           <button className="save-profile-btn" onClick={handleSave} disabled={loading}>
              {loading ? (
                <div className="spinner-sm" />
              ) : (
                <>
                  <Save size={18} /> Update Profile
                </>
              )}
           </button>
        </footer>

        <style>{`
          .edit-profile-overlay { position: fixed; inset: 0; background: rgba(15,11,30,0.8); backdrop-filter: blur(15px); z-index: 3000; display: flex; align-items: center; justify-content: center; padding: 20px; }
          .edit-profile-modal-premium { width: 100%; max-width: 650px; background: white; border-radius: 40px; overflow: hidden; box-shadow: 0 40px 100px rgba(0,0,0,0.4); display: flex; flex-direction: column; }
          
          .edit-modal-header { padding: 40px 40px 20px; display: flex; align-items: flex-start; justify-content: space-between; }
          .header-text h2 { font-size: 28px; font-weight: 900; margin: 0 0 5px 0; }
          .header-text p { font-size: 14px; color: var(--text-muted); font-weight: 600; margin: 0; }
          .close-circle-btn { width: 44px; height: 44px; border-radius: 50%; background: var(--surface-alt); display: flex; align-items: center; justify-content: center; color: var(--text-sec); }

          .edit-modal-body { padding: 0 40px 30px; flex: 1; overflow-y: auto; }
          
          .avatar-edit-preview-section { display: flex; align-items: center; gap: 30px; margin-bottom: 40px; padding: 20px; background: var(--surface-alt); border-radius: 24px; }
          .avatar-glow-wrap { width: 100px; height: 100px; border-radius: 50%; position: relative; flex-shrink: 0; }
          .avatar-glow-wrap img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: 3px solid white; box-shadow: 0 10px 20px rgba(0,0,0,0.1); }
          .avatar-camera-btn { position: absolute; bottom: 0; right: 0; width: 34px; height: 34px; border-radius: 50%; background: var(--primary); color: white; border: 2.5px solid white; display: flex; align-items: center; justify-content: center; }
          
          .avatar-controls { flex: 1; display: flex; flex-direction: column; gap: 8px; }
          .avatar-controls label { font-size: 11px; font-weight: 900; color: var(--text-muted); letter-spacing: 1px; }
          .avatar-controls input { width: 100%; padding: 10px 15px; border-radius: 12px; border: 1.5px solid var(--border); font-size: 13px; font-weight: 600; }

          .edit-form-premium { display: flex; flex-direction: column; gap: 25px; }
          .form-row-two { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
          
          .premium-input-group { display: flex; flex-direction: column; gap: 8px; }
          .premium-input-group label { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 900; color: var(--text-sec); letter-spacing: 1px; }
          .premium-input-group input, .premium-input-group textarea { width: 100%; padding: 14px 20px; border-radius: 16px; border: 2px solid var(--border); font-family: inherit; font-size: 15px; font-weight: 600; transition: all 0.2s; background: #fff; }
          .premium-input-group input:focus, .premium-input-group textarea:focus { border-color: var(--primary); background: #fff; box-shadow: 0 0 0 4px var(--primary-light); outline: none; }

          .edit-error-banner { margin: 0 40px 20px; padding: 15px 20px; background: #FFF5F5; border-radius: 14px; color: #E53E3E; font-size: 13px; font-weight: 700; border: 1px solid #FED7D7; }

          .edit-modal-footer { padding: 30px 40px 40px; display: flex; gap: 20px; border-top: 1px solid var(--border); }
          .cancel-profile-btn { flex: 1; padding: 16px; border-radius: 18px; font-weight: 800; color: var(--text-sec); font-size: 15px; }
          .save-profile-btn { flex: 2; padding: 16px; border-radius: 18px; background: var(--primary); color: white; font-weight: 800; font-size: 15px; display: flex; align-items: center; justify-content: center; gap: 10px; box-shadow: 0 10px 20px rgba(124, 92, 191, 0.2); }
          .save-profile-btn:disabled { opacity: 0.5; box-shadow: none; }

          .spinner-sm { width: 20px; height: 20px; border: 3px solid rgba(255,255,255,0.3); border-bottom-color: white; border-radius: 50%; animation: rotation 1s linear infinite; }
        `}</style>
      </motion.div>
    </div>
  );
};
