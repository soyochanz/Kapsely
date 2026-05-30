// Capsule Models Constants
// This file centralizes all 3D model data (image URLs, tints, and categories)

export const CAPSULE_MODELS = [
    { id: 'basicred_kap', label: 'Basic Red', category: 'Vibe', image: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01red.png', image_open: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01red.png', tint: '#ff4757' },
    { id: 'base_kap', label: 'Base', category: 'Vibe', image: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01base.png', image_open: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01base.png', tint: '#a269ff' },
    { id: 'lego_kap', label: 'Lego', category: 'Vibe', image: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01lgo.png', image_open: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01lgo.png', tint: '#F59E0B', is_trending: true },
    { id: 'bubbletea_kap', label: 'Bubble Tea', category: 'Vibe', image: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01bubble.png', image_open: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01bubble.png', tint: '#B08968', is_trending: true },
    { id: 'strawberry_kap', label: 'Strawberry', category: 'Vibe', image: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01strbrry.png', image_open: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01strbrry.png', tint: '#FB7185' },
    { id: 'penguin_kap', label: 'Penguin', category: 'Vibe', image: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01pngu.png', image_open: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01pngu.png', tint: '#94A3B8', is_trending: true },
    { id: 'shark_kap', label: 'Shark', category: 'Vibe', image: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01shark.png', image_open: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01shark.png', tint: '#60A5FA' },
    { id: 'matcha_kap', label: 'Matcha', category: 'Vibe', image: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01matcha.png', image_open: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01matcha.png', tint: '#34D399' },
    { id: 'puppy_kap', label: 'Puppy', category: 'Vibe', image: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01dog.png', image_open: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01dog.png', tint: '#FB923C', is_trending: true },
    { id: 'cottoncandy_kap', label: 'Cotton candy', category: 'Vibe', image: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01cottoncandy.png', image_open: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/01cottoncandy.png', tint: '#F472B6' },
    { id: 'cartoonkap', label: 'Cartoon', category: 'Vibe', image: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/cartoonkap.png', image_open: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/cartoonkap.png', tint: '#3B82F6' },
    { id: 'goldenkap', label: 'Golden', category: 'Vibe', image: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/goldenkap.png', image_open: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/goldenkap.png', tint: '#EAB308', is_trending: true },
    { id: 'model_1772952082826', label: 'Futuristic', category: 'Vibe', image: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/model_1772952082826.jpg', image_open: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/model_1772952082826.jpg', tint: '#8B5CF6', is_trending: true },
    { id: 'pioneers_cap', label: 'Pioneers', category: 'Vibe', image: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/eventpioneer.png', image_open: 'https://tnvpostnyyjejexnghfp.supabase.co/storage/v1/object/public/models/eventpioneer.png', tint: '#14B8A6' },
] as const;

export type ModelId = (typeof CAPSULE_MODELS)[number]['id'];

export const MODEL_IMAGES = CAPSULE_MODELS.reduce((acc, m) => {
    acc[m.id] = m.image;
    return acc;
}, {} as Record<string, string>);

export const MODEL_IMAGES_OPEN = CAPSULE_MODELS.reduce((acc, m) => {
    acc[m.id] = m.image_open;
    return acc;
}, {} as Record<string, string>);

export const MODEL_TINTS = CAPSULE_MODELS.reduce((acc, m) => {
    acc[m.id] = m.tint;
    return acc;
}, {} as Record<string, string>);

export const MODEL_CATEGORIES = ['All', ...new Set(CAPSULE_MODELS.map(m => m.category))];
