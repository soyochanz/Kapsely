import { timerConfigManager } from '../utils/timerConfig';

export const CAPSULE_MODELS = [
    { id: 'basicred_kap', label: 'Basic Red', category: 'Vibe', image: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01red.png', image_open: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01red.png', tint: '#ff4757', description: 'Classic red capsule for bold memories.' },
    { id: 'base_kap', label: 'Base', category: 'Vibe', image: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01base.png', image_open: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01base.png', tint: '#a269ff', description: 'The standard Kapsely experience.' },
    { id: 'lego_kap', label: 'Lego', category: 'Vibe', image: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01lgo.png', image_open: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01lgo.png', tint: '#FFD700', description: 'For the builders and dreamers.' },
    { id: 'bubbletea_kap', label: 'Bubble Tea', category: 'Vibe', image: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01bubble.png', image_open: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01bubble.png', tint: '#ff9ff3', description: 'Sweet and bubbly moments.' },
    { id: 'strawberry_kap', label: 'Strawberry', category: 'Vibe', image: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01strbrry.png', image_open: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01strbrry.png', tint: '#ff4d8d', description: 'Berry sweet memories.' },
    { id: 'penguin_kap', label: 'Penguin', category: 'Vibe', image: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01pngu.png', image_open: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01pngu.png', tint: '#48dbfb', description: 'Cool and playful.' },
    { id: 'shark_kap', label: 'Shark', category: 'Vibe', image: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01shark.png', image_open: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01shark.png', tint: '#2e86de', description: 'Brave adventures.' },
    { id: 'matcha_kap', label: 'Matcha', category: 'Vibe', image: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01matcha.png', image_open: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01matcha.png', tint: '#1dd1a1', description: 'Zen and peaceful.' },
    { id: 'puppy_kap', label: 'Puppy', category: 'Vibe', image: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01dog.png', image_open: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01dog.png', tint: '#feca57', description: 'Loyal and fluffy.' },
    { id: 'cottoncandy_kap', label: 'Cotton candy', category: 'Vibe', image: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01cottoncandy.png', image_open: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01cottoncandy.png', tint: '#ff9ff3', description: 'Light as a cloud.' },
    { id: 'cartoonkap', label: 'Cartoon', category: 'Vibe', image: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/cartoonkap.png', image_open: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/cartoonkap.png', tint: '#3B82F6', description: 'Animated lifestyle.' },
    { id: 'goldenkap', label: 'Golden', category: 'Vibe', image: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/goldenkap.png', image_open: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/goldenkap.png', tint: '#EAB308', description: 'Premium golden memories.' },
    { id: 'model_1772952082826', label: 'Futuristic', category: 'Vibe', image: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/model_1772952082826.jpg', image_open: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/model_1772952082826.jpg', tint: '#8B5CF6', description: 'From the future, for the future.' },
    { id: 'pioneers_cap', label: 'Pioneers', category: 'Vibe', image: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/eventpioneer.png', image_open: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/eventpioneer.png', tint: '#a269ff', description: 'For the first Kapsely users.' },
];

export const MODELS = CAPSULE_MODELS;

// Full registry including aliases for legacy support
const ALL_MODELS = [
    ...CAPSULE_MODELS,
    { id: 'original', label: 'Original', category: 'Classic', image: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01base.png', image_open: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01base.png', tint: '#a269ff', description: 'The original Kapsely model.' },
    { id: 'classic', label: 'Classic', category: 'Classic', image: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01red.png', image_open: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01red.png', tint: '#ff4757', description: 'Classic design.' },
    { id: 'modern', label: 'Modern', category: 'Vibe', image: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01lgo.png', image_open: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01lgo.png', tint: '#FFD700', description: 'Modern aesthetics.' },
    { id: 'future', label: 'Future', category: 'Vibe', image: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/model_1772952082826.jpg', image_open: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/model_1772952082826.jpg', tint: '#8B5CF6', description: 'Future vibes.' },
];

export const TYPE_CFG: Record<string, any> = {
    legacycap: {
        accent: '#C84B31',
        light: '#FEF1EE',
        emoji: '⏳',
        label: 'LegacyCap',
        tagline: '5-year vault. One life commitment.',
        limit: '1 active capsule max',
        rules: [
            'Only one LegacyCap at a time',
            'Duration: 24h → 5 years',
            'Cannot change settings after sealing',
        ],
    },
    instacap: {
        accent: '#7C5CBF',
        light: '#F3EEFF',
        emoji: '⚡',
        label: 'InstaCap',
        tagline: 'Short-term moments. Weeks or months.',
        limit: '5 active capsules max',
        rules: [
            'Up to 5 active at once',
            'Duration: 24h → 5 years',
            'Supports group capsules',
        ],
    },
    eventcap: {
        accent: '#B87A1A',
        light: '#FEF8EE',
        emoji: '🎉',
        label: 'EventCap',
        tagline: 'Synchronized global opening.',
        limit: 'One per active event',
        rules: [
            'Tied to a specific live event',
            'All EventCaps open simultaneously',
            'Exclusive event-only models',
        ],
    },
    opencap: {
        accent: '#4A6BE0',
        light: '#EEF2FF',
        emoji: '📖',
        label: 'OpenCap',
        tagline: 'Permanent public capsule. No timer.',
        limit: 'Unlimited',
        rules: [
            'Instantly visible and public',
            'No blurring or lock mechanism',
            'Skip the timer — open to all',
        ],
    },
};

export const getModelImage = (id: string | number | undefined | null) => {
  if (!id) return CAPSULE_MODELS[1].image;
  const searchId = String(id).toLowerCase();
  
  // Try DB first (via timerConfigManager)
  const dbImage = timerConfigManager.getModelImage(searchId);
  if (dbImage) return dbImage;

  // Fallback to static list
  const model = ALL_MODELS.find(m => m.id.toLowerCase() === searchId);
  return model?.image || CAPSULE_MODELS[1].image;
};

export const getModelImageOpen = (id: string | number | undefined | null) => {
  if (!id) return CAPSULE_MODELS[1].image_open || CAPSULE_MODELS[1].image;
  const searchId = String(id).toLowerCase();

  // Try DB first
  const dbImage = timerConfigManager.getModelImageOpen(searchId);
  if (dbImage) return dbImage;

  const model = ALL_MODELS.find(m => m.id.toLowerCase() === searchId);
  return model?.image_open || model?.image || CAPSULE_MODELS[1].image;
};

export const getModelTint = (id: string | number | undefined | null) => {
  if (!id) return '#a269ff';
  const searchId = String(id).toLowerCase();
  
  const dbModel = timerConfigManager.getModel(searchId);
  if (dbModel?.tint) return dbModel.tint;

  const model = ALL_MODELS.find(m => m.id.toLowerCase() === searchId);
  return model?.tint || '#a269ff';
};

// --- Branding & UI Helpers ---

export const typeConfig = {
  instacap: { label: 'InstaCap', color: '#a66eff', icon: 'camera' },
  eventcap: { label: 'EventCap', color: '#ff4d4d', icon: 'calendar' },
  legacycap: { label: 'LegacyCap', color: '#ffb300', icon: 'clock' },
  default: { label: 'Capsule', color: '#a66eff', icon: 'clock' },
};

export const getAvatarUrl = (url?: string | null, name?: string | null, favoriteColor?: string | null) => {
  if (url && url.length > 5 && url.startsWith('http')) return url;
  
  const seed = (name && typeof name === 'string' && name.trim()) ? name.trim() : 'User';
  let bgColor = 'a66eff';
  if (favoriteColor && favoriteColor.startsWith('#')) {
      bgColor = favoriteColor.replace('#', '');
  }

  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${bgColor}&fontFamily=Arial,sans-serif&fontWeight=700&fontSize=44&chars=1`;
};
