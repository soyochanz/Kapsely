export interface Notification {
    id: string;
    type: 'like' | 'comment' | 'follow' | 'capsule_opened' | 'capsule_invite' | 'memory';
    user: {
        id?: string;
        username: string;
        avatar: string;
    };
    message: string;
    time: string;
    isRead: boolean;
    capsuleId?: string;
    capsuleTitle?: string;
    capsuleType?: 'eventcap' | 'instacap' | 'legacycap';
    createdAt?: string;
}

export const MOCK_NOTIFICATIONS: Notification[] = [
    {
        id: 'n1',
        type: 'like',
        user: { username: 'arcane._.kai', avatar: 'https://i.pravatar.cc/150?img=3' },
        message: 'liked your capsule',
        time: '2m ago',
        isRead: false,
        capsuleTitle: 'Summer Vibes 2024',
        capsuleType: 'instacap',
    },
    {
        id: 'n2',
        type: 'capsule_opened',
        user: { username: 'stellarxvibe', avatar: 'https://i.pravatar.cc/150?img=5' },
        message: 'Your capsule just opened! ✨',
        time: '15m ago',
        isRead: false,
        capsuleTitle: 'Road Trip Chronicles',
        capsuleType: 'instacap',
    },
    {
        id: 'n3',
        type: 'follow',
        user: { username: 'quantum.petra', avatar: 'https://i.pravatar.cc/150?img=22' },
        message: 'started following you',
        time: '1h ago',
        isRead: false,
    },
    {
        id: 'n4',
        type: 'comment',
        user: { username: 'prism.hour', avatar: 'https://i.pravatar.cc/150?img=14' },
        message: 'commented: "This is absolutely beautiful! 🌊"',
        time: '3h ago',
        isRead: true,
        capsuleTitle: 'Summer Vibes 2024',
        capsuleType: 'instacap',
    },
    {
        id: 'n5',
        type: 'capsule_invite',
        user: { username: 'bloom.seren', avatar: 'https://i.pravatar.cc/150?img=25' },
        message: 'invited you to a shared capsule',
        time: '5h ago',
        isRead: true,
        capsuleTitle: 'Wedding Day Secrets',
        capsuleType: 'eventcap',
    },
    {
        id: 'n6',
        type: 'memory',
        user: { username: 'Kapsely', avatar: '' },
        message: '🕰️ 1 year ago today, you sealed a capsule — want to peek?',
        time: '1d ago',
        isRead: true,
        capsuleTitle: 'Festival Season!',
        capsuleType: 'eventcap',
    },
    {
        id: 'n7',
        type: 'like',
        user: { username: 'cosmos.drift', avatar: 'https://i.pravatar.cc/150?img=20' },
        message: 'and 47 others liked your capsule',
        time: '2d ago',
        isRead: true,
        capsuleTitle: 'To my future self...',
        capsuleType: 'legacycap',
    },
];
