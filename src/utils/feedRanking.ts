type FeedTab = 'following' | 'explore';

type FeedRankingContext = {
    tab: FeedTab;
    followingOwnerIds?: Set<string>;
    participantCapsuleIds?: Set<string>;
    sessionSeenKeys?: Set<string>;
    sessionSeenCapsuleIds?: Set<string>;
};

const EVENT_TYPE_SCORES: Record<string, number> = {
    capsule_opened: 180,
    birthday: 140,
    item_batch_added: 100,
    capsule_created: 70,
    opening_soon: 65,
    capsule_commented: 40,
    old_unseen_capsule: 35,
    recommendation: 20,
};

const getRecencyScore = (activityDate?: string) => {
    if (!activityDate) return 0;
    const ageMs = Date.now() - new Date(activityDate).getTime();
    if (ageMs <= 60 * 60 * 1000) return 100;
    if (ageMs <= 6 * 60 * 60 * 1000) return 80;
    if (ageMs <= 24 * 60 * 60 * 1000) return 60;
    if (ageMs <= 3 * 24 * 60 * 60 * 1000) return 35;
    if (ageMs <= 7 * 24 * 60 * 60 * 1000) return 15;
    return 0;
};

const getEngagementScore = (item: any) => {
    const likes = Number(item.likes_count || 0);
    const comments = Number(item.comments_count || 0);
    const followers = Number(item.capsule_followers_count || 0);
    const posts = Number(item.posts_count || 0);
    return Math.min(85, likes + comments * 5 + followers * 8 + posts * 3);
};

const getBaseScore = (item: any, context: FeedRankingContext) => {
    const followingOwnerIds = context.followingOwnerIds || new Set<string>();
    const participantCapsuleIds = context.participantCapsuleIds || new Set<string>();
    const sessionSeenKeys = context.sessionSeenKeys || new Set<string>();
    const sessionSeenCapsuleIds = context.sessionSeenCapsuleIds || new Set<string>();

    const baseServerScore = Number(item.final_score || 0);
    const eventScore = EVENT_TYPE_SCORES[item.event_type] || 0;
    const recencyScore = getRecencyScore(item.activity_date || item.created_at);
    const engagementScore = getEngagementScore(item);
    const capsuleId = item.capsule_id || item.id;

    let relationshipScore = 0;
    if (item.is_followed_capsule) relationshipScore += 95;
    if (item.owner_id && followingOwnerIds.has(item.owner_id)) relationshipScore += context.tab === 'following' ? 55 : 20;
    if (capsuleId && participantCapsuleIds.has(capsuleId)) relationshipScore += 35;

    let freshnessPenalty = 0;
    if (sessionSeenKeys.has(item.feed_item_key || item.id)) freshnessPenalty += 180;
    if (capsuleId && sessionSeenCapsuleIds.has(capsuleId)) freshnessPenalty += 120;
    if (item.has_seen) freshnessPenalty += 70;

    let exploreBonus = 0;
    if (context.tab === 'explore') {
        if (item.status === 'opened') exploreBonus += 24;
        if (item.is_public) exploreBonus += 16;
        if (Number(item.posts_count || 0) >= 3) exploreBonus += 10;
    } else {
        if (item.event_type === 'birthday') exploreBonus += 40;
        if (item.event_type === 'capsule_opened') exploreBonus += 25;
    }

    let sealedPenalty = 0;
    if (item.status === 'sealed' && !item.is_followed_capsule) {
        sealedPenalty = context.tab === 'explore' ? 28 : 12;
    }

    return baseServerScore + eventScore + recencyScore + engagementScore + relationshipScore + exploreBonus - freshnessPenalty - sealedPenalty;
};

export const rankAndDiversifyFeed = (items: any[], context: FeedRankingContext) => {
    if (!Array.isArray(items) || items.length === 0) return [];

    const bestByKey = new Map<string, any>();
    const bestByCapsule = new Map<string, any>();

    for (const rawItem of items) {
        if (!rawItem) continue;
        const item = { ...rawItem };
        const key = item.feed_item_key || item.id;
        const capsuleKey = item.event_type === 'birthday' ? null : (item.capsule_id || item.id);
        const score = getBaseScore(item, context);
        item._clientScore = score;

        const existingByKey = bestByKey.get(key);
        if (!existingByKey || score > existingByKey._clientScore) {
            bestByKey.set(key, item);
        }

        if (capsuleKey) {
            const existingByCapsule = bestByCapsule.get(capsuleKey);
            if (!existingByCapsule || score > existingByCapsule._clientScore) {
                bestByCapsule.set(capsuleKey, item);
            }
        }
    }

    const deduped = Array.from(bestByKey.values()).filter(item => {
        if (item.event_type === 'birthday') return true;
        const capsuleKey = item.capsule_id || item.id;
        return bestByCapsule.get(capsuleKey)?.feed_item_key === (item.feed_item_key || item.id);
    });

    const remaining = deduped.sort((a, b) => {
        const scoreDiff = Number(b._clientScore || 0) - Number(a._clientScore || 0);
        if (scoreDiff !== 0) return scoreDiff;
        return new Date(b.activity_date || b.created_at || 0).getTime() - new Date(a.activity_date || a.created_at || 0).getTime();
    });

    const result: any[] = [];
    const recentAuthors: string[] = [];
    const recentCapsules: string[] = [];
    let sealedStreak = 0;

    while (remaining.length > 0) {
        let bestIndex = 0;
        let bestScore = -Infinity;

        for (let index = 0; index < remaining.length; index += 1) {
            const item = remaining[index];
            const capsuleKey = item.capsule_id || item.id;
            let adjusted = Number(item._clientScore || 0);

            if (item.owner_id && recentAuthors[0] === item.owner_id) adjusted -= 260;
            else if (item.owner_id && recentAuthors.includes(item.owner_id)) adjusted -= 120;

            if (capsuleKey && recentCapsules[0] === capsuleKey) adjusted -= 320;
            else if (capsuleKey && recentCapsules.includes(capsuleKey)) adjusted -= 140;

            if (item.status === 'sealed' && sealedStreak >= 2 && !item.is_followed_capsule) adjusted -= 120;
            if (item.event_type === 'birthday' && result.slice(-4).some(entry => entry.event_type === 'birthday')) adjusted -= 180;
            if (context.tab === 'explore' && item.event_type === 'recommendation' && result.length < 4) adjusted -= 60;

            if (adjusted > bestScore) {
                bestScore = adjusted;
                bestIndex = index;
            }
        }

        const [chosen] = remaining.splice(bestIndex, 1);
        result.push(chosen);

        const chosenCapsuleKey = chosen.capsule_id || chosen.id;
        if (chosen.owner_id) {
            recentAuthors.unshift(chosen.owner_id);
            if (recentAuthors.length > 3) recentAuthors.pop();
        }
        if (chosenCapsuleKey) {
            recentCapsules.unshift(chosenCapsuleKey);
            if (recentCapsules.length > 4) recentCapsules.pop();
        }
        sealedStreak = chosen.status === 'sealed' ? sealedStreak + 1 : 0;
    }

    return result.map(({ _clientScore, ...item }) => item);
};
