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
    <div className="flash-strip" aria-label="Flashes">
      <button className="flash-bubble add-flash" onClick={onPressMyStory}>
        <div className={`flash-ring ${myStory ? '' : 'seen'}`}>
          {myStory ? (
            <img src={myStory.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${myStory.username}`} className="flash-avatar" alt="My Story" />
          ) : (
            <div className="flash-avatar flash-add-avatar">
              <Plus size={24} />
            </div>
          )}
        </div>
        <span>Tu flash</span>
      </button>

      {stories.map((user) => (
        <button key={user.owner_id} className="flash-bubble" onClick={() => onPressStory(user)}>
          <div className={`flash-ring ${user.all_read ? 'seen' : ''}`}>
            <img 
              src={user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`} 
              className="flash-avatar" 
              alt={user.username} 
            />
          </div>
          <span>{user.display_name || user.username}</span>
        </button>
      ))}
    </div>
  );
};
