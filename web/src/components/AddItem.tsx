import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Image as ImageIcon, FileText, Upload, Check, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface AddItemProps {
  capsuleId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const AddItem: React.FC<AddItemProps> = ({ capsuleId, onClose, onSuccess }) => {
  const [type, setType] = useState<'image' | 'note'>('image');
  const [content, setContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    try {
      setUploading(true);
      setError(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      let mediaUrl = '';
      if (type === 'image' && file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('capsule-media')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('capsule-media')
          .getPublicUrl(filePath);
        
        mediaUrl = publicUrl;
      }

      const { error: insertError } = await supabase
        .from('capsule_items')
        .insert({
          capsule_id: capsuleId,
          owner_id: user.id,
          media_type: type,
          media_url: mediaUrl,
          content: type === 'note' ? content : '',
        });

      if (insertError) throw insertError;

      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="modal-overlay"
      style={{ zIndex: 3000 }}
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="modal-content glass-card add-item-modal"
      >
        <div className="modal-header">
          <h2>Add Content</h2>
          <button onClick={onClose} className="close-btn"><X /></button>
        </div>

        <div className="type-toggle-pills">
          <button 
            className={type === 'image' ? 'active' : ''} 
            onClick={() => setType('image')}
          >
            <ImageIcon size={18} /> Photo
          </button>
          <button 
            className={type === 'note' ? 'active' : ''} 
            onClick={() => setType('note')}
          >
            <FileText size={18} /> Note
          </button>
        </div>

        <div className="add-item-body">
          {type === 'image' ? (
            <div className="upload-zone" onClick={() => document.getElementById('file-input')?.click()}>
              <input 
                type="file" 
                id="file-input" 
                hidden 
                accept="image/*" 
                onChange={handleFileChange} 
              />
              {file ? (
                <div className="file-preview">
                  <Check size={40} color="var(--primary)" />
                  <p>{file.name}</p>
                  <button className="secondary-btn btn-sm" onClick={(e) => { e.stopPropagation(); setFile(null); }}>Change</button>
                </div>
              ) : (
                <>
                  <Upload size={40} opacity={0.3} />
                  <p>Click to select an image</p>
                  <span>Maximum size: 5MB</span>
                </>
              )}
            </div>
          ) : (
            <div className="note-input-zone">
              <textarea 
                placeholder="Write your memory here..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                maxLength={500}
              />
              <span className="char-count">{content.length}/500</span>
            </div>
          )}
        </div>

        {error && (
          <div className="error-banner">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        <button 
          className="primary-btn upload-submit-btn" 
          onClick={handleUpload}
          disabled={uploading || (type === 'image' && !file) || (type === 'note' && !content.trim())}
        >
          {uploading ? 'Uploading...' : 'Add to Capsule'}
        </button>

        <style>{`
          .add-item-modal {
            max-width: 450px;
            width: 90%;
            padding: 30px;
          }
          .type-toggle-pills {
            display: flex;
            gap: 10px;
            background: var(--surface-alt);
            padding: 5px;
            border-radius: 100px;
            margin-bottom: 25px;
          }
          .type-toggle-pills button {
            flex: 1;
            padding: 10px;
            border-radius: 100px;
            border: none;
            background: none;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            color: var(--text-sec);
            transition: all 0.2s;
          }
          .type-toggle-pills button.active {
            background: white;
            color: var(--primary);
            box-shadow: 0 2px 8px rgba(0,0,0,0.05);
          }
          
          .upload-zone {
            height: 200px;
            border: 2px dashed var(--border);
            border-radius: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 15px;
            cursor: pointer;
            transition: all 0.2s;
          }
          .upload-zone:hover { border-color: var(--primary); background: var(--primary-light); }
          .upload-zone span { font-size: 0.75rem; color: var(--text-muted); }
          
          .note-input-zone {
            position: relative;
          }
          .note-input-zone textarea {
            width: 100%;
            height: 200px;
            padding: 20px;
            border-radius: 20px;
            border: 1.5px solid var(--border);
            background: #FFF9E0;
            color: #5D4037;
            font-family: inherit;
            font-size: 1rem;
            resize: none;
            outline: none;
          }
          .char-count {
            position: absolute;
            bottom: 15px;
            right: 15px;
            font-size: 0.75rem;
            color: #5D4037;
            opacity: 0.6;
          }
          
          .upload-submit-btn { width: 100%; margin-top: 25px; justify-content: center; }
          .error-banner {
            display: flex;
            align-items: center;
            gap: 10px;
            background: #FFF0F1;
            color: #E53E3E;
            padding: 12px;
            border-radius: 12px;
            font-size: 0.85rem;
            margin-top: 20px;
          }
        `}</style>
      </motion.div>
    </motion.div>
  );
};
