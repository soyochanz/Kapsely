export type WebFeedTab = 'following' | 'explore';

type RankingContext = {
  tab: WebFeedTab;
  viewerId: string;
  followingIds: Set<string>;
  followedCapsuleIds: Set<string>;
  participantCapsuleIds: Set<string>;
  seenCapsuleIds: Set<string>;
  seed: string;
};

const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

const stableNoise = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (Math.abs(hash) % 1000) / 1000;
};

const recency = (date?: string) => {
  const ageHours = Math.max(0, (Date.now() - new Date(date || 0).getTime()) / 3_600_000);
  if (ageHours <= 2) return 92;
  if (ageHours <= 12) return 72;
  if (ageHours <= 24) return 56;
  if (ageHours <= 72) return 34;
  if (ageHours <= 168) return 15;
  return 0;
};

const engagement = (item: any) => Math.min(105,
  Math.log1p(number(item.likes_count)) * 12
  + Math.log1p(number(item.comments_count)) * 20
  + Math.min(number(item.posts_count), 8) * 5
  + Math.log1p(number(item.participants_count)) * 8
);

export const rankWebFeed = (items: any[], context: RankingContext) => {
  const scored = items.map(item => {
    const capsuleId = item.capsule_id || item.id;
    const isFollowing = context.followingIds.has(item.owner_id);
    const isFollowedCapsule = context.followedCapsuleIds.has(capsuleId);
    const isParticipant = context.participantCapsuleIds.has(capsuleId);
    const wasSeen = context.seenCapsuleIds.has(capsuleId);
    const relationship =
      (item.owner_id === context.viewerId ? 80 : 0)
      + (isFollowing ? (context.tab === 'following' ? 105 : 28) : 0)
      + (isFollowedCapsule ? 120 : 0)
      + (isParticipant ? 110 : 0)
      + (item.is_liked ? 50 : 0);
    const discovery = context.tab === 'explore'
      ? (item.status === 'opened' ? 28 : 0)
        + (item.posts_count >= 2 ? 22 : 0)
        + (number(item.likes_count) <= 3 ? 16 : 0)
      : 0;
    const seenPenalty = wasSeen ? (context.tab === 'explore' ? 155 : 95) : 0;
    const noise = stableNoise(`${context.seed}:${capsuleId}`) * (context.tab === 'explore' ? 24 : 8);

    return {
      ...item,
      is_followed_author: isFollowing,
      is_participant: isParticipant,
      ranking_reason: isParticipant ? 'Tu cápsula' : isFollowedCapsule ? 'La sigues' : isFollowing ? 'Siguiendo' : item.is_liked ? 'Te gustó' : context.tab === 'explore' ? 'Para ti' : 'Reciente',
      _score: relationship + recency(item.activity_date || item.updated_at || item.created_at) + engagement(item) + discovery + noise - seenPenalty,
    };
  });

  const bestByCapsule = new Map<string, any>();
  scored.forEach(item => {
    const key = item.capsule_id || item.id;
    const current = bestByCapsule.get(key);
    if (!current || item._score > current._score) bestByCapsule.set(key, item);
  });

  const pool = [...bestByCapsule.values()].sort((a, b) => b._score - a._score);
  const result: any[] = [];
  const recentAuthors: string[] = [];
  let sealedRun = 0;

  while (pool.length) {
    let winner = 0;
    let winnerScore = -Infinity;
    pool.forEach((item, index) => {
      let score = item._score;
      if (recentAuthors[0] === item.owner_id) score -= 240;
      else if (recentAuthors.includes(item.owner_id)) score -= 90;
      if (sealedRun >= 2 && item.status === 'sealed') score -= 100;
      if (score > winnerScore) {
        winner = index;
        winnerScore = score;
      }
    });
    const [chosen] = pool.splice(winner, 1);
    result.push(chosen);
    if (chosen.owner_id) {
      recentAuthors.unshift(chosen.owner_id);
      if (recentAuthors.length > 3) recentAuthors.pop();
    }
    sealedRun = chosen.status === 'sealed' ? sealedRun + 1 : 0;
  }

  return result.map(({ _score, ...item }) => item);
};
