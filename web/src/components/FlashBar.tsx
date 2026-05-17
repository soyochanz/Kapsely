import React from 'react';
import { Plus } from 'lucide-react';

interface FlashBarProps {
  stories: any[];
  myStory: any;
  onPressMyStory: () => void;
  onPressStory: (story: any) => void;
}

export const FlashBar: React.FC<FlashBarProps> = ({ 
  stories, 
  myStory, 
  onPressMyStory, 
  onPressStory 
}) => {
  return (
    <div className="flash-bar">
      {/* Your Story */}
      <div className="flash-item" onClick={onPressMyStory}>
        <div className={`flash-ring ${myStory ? '' : 'seen'}`} style={{ background: !myStory ? 'var(--border)' : undefined }}>
          {myStory ? (
            <img src={myStory.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${myStory.username}`} className="flash-avatar" alt="My Story" />
          ) : (
            <div className="flash-avatar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-alt)' }}>
              <Plus size={24} color="var(--primary)" />
            </div>
          )}
        </div>
        <span className="flash-name">Your Flash</span>
      </div>

      {/* Others Stories */}
      {stories.map((user) => (
        <div key={user.owner_id} className="flash-item" onClick={() => onPressStory(user)}>
          <div className={`flash-ring ${user.all_read ? 'seen' : ''}`}>
            <img 
              src={user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`} 
              className="flash-avatar" 
              alt={user.username} 
            />
          </div>
          <span className="flash-name">{user.display_name || user.username}</span>
        </div>
      ))}
    </div>
  );
};
