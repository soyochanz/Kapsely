import { Fonts } from '../theme';

export const TEXT_STYLES = [
    { id: 'marker', label: '🖍 Marker', fontFamily: 'PermanentMarker_400Regular' },
    { id: 'bangers', label: '💥 Bang', fontFamily: 'Bangers_400Regular' },
    { id: 'caveat', label: '✍️ Pen', fontFamily: 'Caveat_700Bold' },
    { id: 'neon', label: '⚡ Spark', fontFamily: 'Outfit_700Bold' },
    { id: 'ghost', label: '👻 Classic', fontFamily: 'Poppins_400Regular' },
    { id: 'titan', label: '🗿 Titan', fontFamily: 'TitanOne_400Regular' },
    { id: 'velvet', label: '🌹 Velvet', fontFamily: 'Lobster_400Regular' },
    { id: 'pixel', label: '🕹 Pixel', fontFamily: 'SpaceMono_400Regular' },
    { id: 'aurora', label: '🌌 Aurora', fontFamily: 'Inter_300Light' },
    { id: 'brute', label: '🔩 Brute', fontFamily: 'Poppins_800ExtraBold' },
];

export const TEXT_BG_OPTIONS = [
    { id: 'none', label: 'flashes.bg_none', value: 'transparent' },
    { id: 'dark', label: 'flashes.bg_dark', value: 'rgba(0,0,0,0.55)' },
    { id: 'white', label: 'flashes.bg_white', value: 'rgba(255,255,255,0.75)' },
    { id: 'blur', label: 'flashes.bg_blur', value: 'rgba(30,20,60,0.6)' },
];

export const FILTERS = [
    { id: 'none', label: 'flashes.original', color: 'transparent' },
    { id: 'vintage', label: 'flashes.vintage', color: 'rgba(230,190,120,0.25)' },
    { id: 'warm', label: 'flashes.warm', color: 'rgba(255,150,50,0.18)' },
    { id: 'cool', label: 'flashes.cool', color: 'rgba(0,150,255,0.18)' },
    { id: 'dark', label: 'flashes.dark', color: 'rgba(0,0,0,0.4)' },
    { id: 'noir', label: 'flashes.noir', color: 'rgba(0,0,0,0.3)', grayscale: true },
];
