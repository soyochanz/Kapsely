export type CapsuleType = 'eventcap' | 'instacap' | 'legacycap';
export type CapsuleState = 'sealed' | 'opened';

export interface Capsule {
    id: string;
    type: CapsuleType;
    state: CapsuleState;
    title: string;
    creator: {
        id: string;
        username: string;
        avatar: string;
        verified: boolean;
    };
    mediaUrls: string[];
    caption: string;
    openDate: string;
    createdAt: string;
    likes: number;
    comments: number;
    shares: number;
    isLiked: boolean;
    location?: string;
}

export const MOCK_CAPSULES: Capsule[] = [
    {
        id: '1',
        type: 'instacap',
        state: 'opened',
        title: 'Summer Vibes 2024',
        creator: {
            id: 'u1',
            username: 'nova_leyla',
            avatar: 'https://i.pravatar.cc/150?img=1',
            verified: true,
        },
        mediaUrls: [
            'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600',
            'https://images.unsplash.com/photo-1519046904884-53103b34b206?w=600',
        ],
        caption: 'Those golden hours we promised we\'d never forget 🌊✨',
        openDate: '2025-01-01',
        createdAt: '2024-06-15',
        likes: 1248,
        comments: 87,
        shares: 34,
        isLiked: true,
        location: 'Tulum, Mexico',
    },
    {
        id: '2',
        type: 'legacycap',
        state: 'sealed',
        title: 'To my future self...',
        creator: {
            id: 'u2',
            username: 'arcane._.kai',
            avatar: 'https://i.pravatar.cc/150?img=3',
            verified: false,
        },
        mediaUrls: [],
        caption: 'A message to open in 10 years',
        openDate: '2034-12-31',
        createdAt: '2024-12-31',
        likes: 3421,
        comments: 210,
        shares: 567,
        isLiked: false,
    },
    {
        id: '3',
        type: 'eventcap',
        state: 'sealed',
        title: 'New Year\'s Eve Party Memories',
        creator: {
            id: 'u3',
            username: 'stellarxvibe',
            avatar: 'https://i.pravatar.cc/150?img=5',
            verified: true,
        },
        mediaUrls: [],
        caption: 'Sealing tonight\'s magic for exactly 1 year',
        openDate: '2026-01-01',
        createdAt: '2025-01-01',
        likes: 892,
        comments: 43,
        shares: 12,
        isLiked: true,
        location: 'New York City, US',
    },
    {
        id: '4',
        type: 'instacap',
        state: 'opened',
        title: 'Road Trip Chronicles',
        creator: {
            id: 'u4',
            username: 'driftwood.nyx',
            avatar: 'https://i.pravatar.cc/150?img=8',
            verified: false,
        },
        mediaUrls: [
            'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=600',
        ],
        caption: 'Every highway has a story to tell 🛣️',
        openDate: '2025-02-14',
        createdAt: '2024-07-20',
        likes: 567,
        comments: 29,
        shares: 8,
        isLiked: false,
        location: 'Route 66, USA',
    },
    {
        id: '5',
        type: 'legacycap',
        state: 'sealed',
        title: 'Grandma\'s Secret Recipe',
        creator: {
            id: 'u5',
            username: 'celeste.archive',
            avatar: 'https://i.pravatar.cc/150?img=11',
            verified: true,
        },
        mediaUrls: [],
        caption: 'Our family legacy, sealed for the next generation',
        openDate: '2050-06-01',
        createdAt: '2025-01-15',
        likes: 8934,
        comments: 1203,
        shares: 2341,
        isLiked: true,
    },
    {
        id: '6',
        type: 'eventcap',
        state: 'opened',
        title: 'Festival Season!',
        creator: {
            id: 'u6',
            username: 'prism.hour',
            avatar: 'https://i.pravatar.cc/150?img=14',
            verified: false,
        },
        mediaUrls: [
            'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=600',
            'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=600',
        ],
        caption: 'We lived so much in those 72 hours 🎉🎪',
        openDate: '2025-08-20',
        createdAt: '2024-08-20',
        likes: 2156,
        comments: 94,
        shares: 67,
        isLiked: false,
        location: 'Coachella Valley, CA',
    },
];

// Explore feed — community capsules
export const MOCK_EXPLORE_CAPSULES: Capsule[] = [
    {
        id: 'e1',
        type: 'legacycap',
        state: 'sealed',
        title: 'Apollo Mission Archive',
        creator: { id: 'eu1', username: 'cosmos.drift', avatar: 'https://i.pravatar.cc/150?img=20', verified: true },
        mediaUrls: [],
        caption: 'Preserving humanity\'s greatest achievement',
        openDate: '2069-07-20',
        createdAt: '2024-07-20',
        likes: 45231,
        comments: 3421,
        shares: 12098,
        isLiked: false,
    },
    {
        id: 'e2',
        type: 'instacap',
        state: 'opened',
        title: 'First Day at MIT',
        creator: { id: 'eu2', username: 'quantum.petra', avatar: 'https://i.pravatar.cc/150?img=22', verified: false },
        mediaUrls: ['https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=600'],
        caption: 'The beginning of everything 🎓',
        openDate: '2025-05-30',
        createdAt: '2024-09-01',
        likes: 12450,
        comments: 891,
        shares: 234,
        isLiked: true,
        location: 'Cambridge, MA',
    },
    {
        id: 'e3',
        type: 'eventcap',
        state: 'sealed',
        title: 'Wedding Day Secrets',
        creator: { id: 'eu3', username: 'bloom.seren', avatar: 'https://i.pravatar.cc/150?img=25', verified: true },
        mediaUrls: [],
        caption: 'Opening together on our 5th anniversary 💍',
        openDate: '2030-03-14',
        createdAt: '2025-03-14',
        likes: 67823,
        comments: 5621,
        shares: 15432,
        isLiked: false,
    },
];
