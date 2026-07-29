type FeedTab = 'following' | 'explore';

type FeedRankingContext = {
    tab: FeedTab;
    followingOwnerIds?: Set<string>;
    participantCapsuleIds?: Set<string>;
    followedCapsuleIds?: Set<string>;
    likedCapsuleIds?: Set<string>;
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

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const getNumber = (value: any) => {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

const getEngagementScore = (item: any) => {
    const likes = getNumber(item.likes_count);
    const comments = getNumber(item.comments_count);
    const followers = getNumber(item.capsule_followers_count);
    const posts = getNumber(item.posts_count);

    const qualityScore =
        Math.log1p(likes) * 9
        + Math.log1p(comments) * 16
        + Math.log1p(followers) * 12
        + Math.min(posts, 6) * 4;

    return clamp(qualityScore, 0, 95);
};

const getBaseScore = (item: any, context: FeedRankingContext) => {
    const followingOwnerIds = context.followingOwnerIds || new Set<string>();
    const participantCapsuleIds = context.participantCapsuleIds || new Set<string>();
    const followedCapsuleIds = context.followedCapsuleIds || new Set<string>();
    const likedCapsuleIds = context.likedCapsuleIds || new Set<string>();
    const sessionSeenKeys = context.sessionSeenKeys || new Set<string>();
    const sessionSeenCapsuleIds = context.sessionSeenCapsuleIds || new Set<string>();

    const baseServerScore = getNumber(item.final_score);
    const eventScore = EVENT_TYPE_SCORES[item.event_type] || 0;
    const recencyScore = getRecencyScore(item.activity_date || item.created_at);
    const engagementScore = getEngagementScore(item);
    const capsuleId = item.capsule_id || item.id;

    let relationshipScore = 0;
    if (item.is_followed_capsule || (capsuleId && followedCapsuleIds.has(capsuleId))) relationshipScore += 125;
    if (item.is_liked || (capsuleId && likedCapsuleIds.has(capsuleId))) relationshipScore += context.tab === 'explore' ? 70 : 42;
    if (item.has_commented) relationshipScore += 82;
    if (item.owner_id && followingOwnerIds.has(item.owner_id)) relationshipScore += context.tab === 'following' ? 55 : 20;
    if (capsuleId && participantCapsuleIds.has(capsuleId)) relationshipScore += 55;
    if (item.is_participant) relationshipScore += 45;
    if (item.is_friend_of_friend) relationshipScore += context.tab === 'explore' ? 64 : 20;
    if (item.is_mutual_friend) relationshipScore += context.tab === 'explore' ? 44 : 24;
    relationshipScore += Math.min(85, getNumber(item.viewer_author_likes) * 14);
    relationshipScore += Math.min(95, getNumber(item.viewer_author_comments) * 24);
    relationshipScore += Math.min(80, getNumber(item.viewer_author_opens) * 20);
    relationshipScore += Math.min(74, getNumber(item.viewer_author_views) * 9);
    relationshipScore += Math.min(96, getNumber(item.viewer_author_capsule_follows) * 22);

    let freshnessPenalty = 0;
    if (sessionSeenKeys.has(item.feed_item_key || item.id)) freshnessPenalty += 240;
    if (capsuleId && sessionSeenCapsuleIds.has(capsuleId)) freshnessPenalty += 150;
    if (item.has_seen) freshnessPenalty += getNumber(item.recent_seen_penalty) || 115;
    if (item.seen_in_current_session) freshnessPenalty += 180;

    let exploreBonus = 0;
    if (context.tab === 'explore') {
        if (item.status === 'opened') exploreBonus += 30;
        if (item.is_public) exploreBonus += 14;
        if (getNumber(item.posts_count) >= 3) exploreBonus += 12;
        if (item.is_friend_of_friend) exploreBonus += Math.min(35, getNumber(item.mutual_friend_count) * 7);
        if (!item.is_followed_author && (item.is_followed_capsule || item.is_liked)) exploreBonus += 42;
    } else {
        if (item.event_type === 'birthday') exploreBonus += 40;
        if (item.event_type === 'capsule_opened') exploreBonus += 25;
        if (item.has_new_activity) exploreBonus += 30;
    }

    let sealedPenalty = 0;
    if (item.status === 'sealed' && !item.is_followed_capsule) {
        sealedPenalty = context.tab === 'explore' ? 28 : 12;
    }

    const ignoredAuthorPenalty = item.viewer_author_passive_views >= 6 && getNumber(item.viewer_author_opens) === 0 ? 55 : 0;
    const smallCreatorFairness = getNumber(item.capsule_followers_count) <= 2 && getNumber(item.likes_count) <= 3 ? 16 : 0;

    return (
        baseServerScore
        + eventScore
        + recencyScore
        + engagementScore
        + relationshipScore
        + exploreBonus
        + smallCreatorFairness
        - freshnessPenalty
        - sealedPenalty
        - ignoredAuthorPenalty
    );
};

export const rankAndDiversifyFeed = (items: any[], context: FeedRankingContext) => {
    if (!Array.isArray(items) || items.length === 0) return [];

    const bestByKey = new Map<string, any>();
    const bestByCapsule = new Map<string, any>();

    for (const rawItem of items) {
        if (!rawItem) continue;
        const item = { ...rawItem };
        const key = item.feed_item_key || item.id;
        const capsuleKey = item.event_type === 'birthday' || item.upload_batch_key ? null : (item.capsule_id || item.id);
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
    const recentReasons: string[] = [];
    let sealedStreak = 0;

    while (remaining.length > 0) {
        let bestIndex = 0;
        let bestScore = -Infinity;

        for (let index = 0; index < remaining.length; index += 1) {
            const item = remaining[index];
            const capsuleKey = item.capsule_id || item.id;
            let adjusted = Number(item._clientScore || 0);

            if (item.owner_id && recentAuthors[0] === item.owner_id) adjusted -= 360;
            else if (item.owner_id && recentAuthors.includes(item.owner_id)) adjusted -= 120;
            if (item.owner_id && recentAuthors[0] === item.owner_id && recentAuthors[1] === item.owner_id) adjusted -= 520;

            if (capsuleKey && recentCapsules[0] === capsuleKey) adjusted -= 320;
            else if (capsuleKey && recentCapsules.includes(capsuleKey)) adjusted -= 140;

            if (item.status === 'sealed' && sealedStreak >= 2 && !item.is_followed_capsule) adjusted -= 120;
            if (item.event_type === 'birthday' && result.slice(-4).some(entry => entry.event_type === 'birthday')) adjusted -= 180;
            if (context.tab === 'explore' && item.event_type === 'recommendation' && result.length < 4) adjusted -= 60;
            if (context.tab === 'explore' && item.relationship_reason && recentReasons[0] === item.relationship_reason) adjusted -= 34;

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
        if (chosen.relationship_reason) {
            recentReasons.unshift(chosen.relationship_reason);
            if (recentReasons.length > 3) recentReasons.pop();
        }
        sealedStreak = chosen.status === 'sealed' ? sealedStreak + 1 : 0;
    }

    const softenedRuns: any[] = [];
    const queue = [...result];

    while (queue.length > 0) {
        const lastAuthor = softenedRuns[softenedRuns.length - 1]?.owner_id;
        const previousAuthor = softenedRuns[softenedRuns.length - 2]?.owner_id;
        const wouldMakeTriple = !!lastAuthor && lastAuthor === previousAuthor && queue[0]?.owner_id === lastAuthor;

        if (wouldMakeTriple) {
            const alternativeIndex = queue.findIndex(item => item?.owner_id && item.owner_id !== lastAuthor);
            if (alternativeIndex > 0) {
                softenedRuns.push(queue.splice(alternativeIndex, 1)[0]);
                continue;
            }
        }

        softenedRuns.push(queue.shift());
    }

    return softenedRuns.map(({ _clientScore, ...item }) => item);
};
