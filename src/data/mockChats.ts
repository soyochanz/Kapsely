export interface ChatMessage {
    id: string;
    text: string;
    isOwn: boolean;
    time: string;
    type: 'text' | 'capsule_share';
    capsuleTitle?: string;
    capsuleType?: 'eventcap' | 'instacap' | 'legacycap';
}

export interface Conversation {
    id: string;
    user: {
        username: string;
        handle: string;
        avatar: string;
        isOnline: boolean;
    };
    lastMessage: string;
    time: string;
    unreadCount: number;
    isSharedCapsule?: boolean;
    capsuleTitle?: string;
    capsuleType?: 'eventcap' | 'instacap' | 'legacycap';
}

export const MOCK_CONVERSATIONS: Conversation[] = [
    {
        id: 'c1',
        user: { username: 'Nova Leyla', handle: 'nova_leyla', avatar: 'https://i.pravatar.cc/150?img=1', isOnline: true },
        lastMessage: 'Did you see the capsule I just sealed? 🔮',
        time: '2m',
        unreadCount: 3,
    },
    {
        id: 'c2',
        user: { username: 'Arcane Kai', handle: 'arcane._.kai', avatar: 'https://i.pravatar.cc/150?img=3', isOnline: false },
        lastMessage: 'Shared a capsule with you',
        time: '15m',
        unreadCount: 1,
        isSharedCapsule: true,
        capsuleTitle: 'Late Night Thoughts',
        capsuleType: 'legacycap',
    },
    {
        id: 'c3',
        user: { username: 'Stellar Vibe', handle: 'stellarxvibe', avatar: 'https://i.pravatar.cc/150?img=5', isOnline: true },
        lastMessage: 'OMG it finally opened!! 🎉',
        time: '1h',
        unreadCount: 0,
    },
    {
        id: 'c4',
        user: { username: 'Driftwood Nyx', handle: 'driftwood.nyx', avatar: 'https://i.pravatar.cc/150?img=8', isOnline: false },
        lastMessage: 'when does your next legacy cap open?',
        time: '3h',
        unreadCount: 0,
    },
    {
        id: 'c5',
        user: { username: 'Celeste Archive', handle: 'celeste.archive', avatar: 'https://i.pravatar.cc/150?img=11', isOnline: false },
        lastMessage: 'That road trip cap was everything 🛣️',
        time: '1d',
        unreadCount: 0,
    },
];

export const MOCK_CHAT_MESSAGES: ChatMessage[] = [
    { id: 'm1', text: 'Hey! Did you open the capsule yet?', isOwn: false, time: '10:30 AM', type: 'text' },
    { id: 'm2', text: 'Not yet! It opens in 3 days 😭', isOwn: true, time: '10:31 AM', type: 'text' },
    { id: 'm3', text: 'I can\'t wait to see what\'s inside!', isOwn: false, time: '10:31 AM', type: 'text' },
    {
        id: 'm4', text: '', isOwn: true, time: '10:33 AM', type: 'capsule_share',
        capsuleTitle: 'Summer Vibes 2024', capsuleType: 'instacap',
    },
    { id: 'm5', text: 'Sharing this one while we wait 😊', isOwn: true, time: '10:33 AM', type: 'text' },
    { id: 'm6', text: 'Oh wow this is so beautiful 🌊✨', isOwn: false, time: '10:35 AM', type: 'text' },
    { id: 'm7', text: 'Did you see the capsule I just sealed? 🔮', isOwn: false, time: '10:40 AM', type: 'text' },
];
