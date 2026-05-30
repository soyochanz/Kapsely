import { supabase } from '../lib/supabase';

export type ReportType = 'user' | 'capsule' | 'capsule_item' | 'comment' | 'chat_message' | 'capsule_chat';

const SAFETY_CACHE_TTL_MS = 60 * 1000;
const safetyIdsCache = new Map<string, { expiresAt: number; ids: string[] }>();
const inflightSafetyRequests = new Map<string, Promise<string[]>>();

const clearSafetyCacheFor = (userId?: string | null) => {
    if (!userId) return;
    safetyIdsCache.delete(userId);
    inflightSafetyRequests.delete(userId);
};

export const safetyService = {
    async blockUser(blockerId: string, blockedId: string) {
        const result = await supabase.from('blocks').insert({
            blocker_id: blockerId,
            blocked_id: blockedId
        });
        clearSafetyCacheFor(blockerId);
        clearSafetyCacheFor(blockedId);
        return result;
    },

    async unblockUser(blockerId: string, blockedId: string) {
        const result = await supabase.from('blocks').delete()
            .eq('blocker_id', blockerId)
            .eq('blocked_id', blockedId);
        clearSafetyCacheFor(blockerId);
        clearSafetyCacheFor(blockedId);
        return result;
    },

    async isBlocked(blockerId: string, blockedId: string) {
        const { data } = await supabase.from('blocks')
            .select('*')
            .eq('blocker_id', blockerId)
            .eq('blocked_id', blockedId)
            .maybeSingle();
        return !!data;
    },

    async getBlockedUserIds(userId: string) {
        const { data } = await supabase.from('blocks')
            .select('blocked_id')
            .eq('blocker_id', userId);
        return (data || []).map(b => b.blocked_id);
    },

    async getAllSafetyUserIds(userId: string) {
        const cached = safetyIdsCache.get(userId);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.ids;
        }

        const inflight = inflightSafetyRequests.get(userId);
        if (inflight) {
            return inflight;
        }

        const request = (async () => {
        try {
            const [blockedByMe, blockingMe] = await Promise.all([
                supabase.from('blocks').select('blocked_id').eq('blocker_id', userId),
                supabase.from('blocks').select('blocker_id').eq('blocked_id', userId)
            ]);

            const ids = new Set([
                ...(blockedByMe.data || []).map(b => b.blocked_id),
                ...(blockingMe.data || []).map(b => b.blocker_id)
            ]);
            const result = Array.from(ids);
            safetyIdsCache.set(userId, {
                ids: result,
                expiresAt: Date.now() + SAFETY_CACHE_TTL_MS,
            });
            return result;
        } catch (e) {
            console.warn('[Safety] Blocks table unavailable or error fetching', e);
            return [];
        } finally {
            inflightSafetyRequests.delete(userId);
        }
        })();

        inflightSafetyRequests.set(userId, request);
        return request;
    },

    async report({
        reporterId,
        targetId,
        targetType,
        reason
    }: {
        reporterId: string;
        targetId: string;
        targetType: ReportType;
        reason: string;
    }) {
        return await supabase.from('reports').insert({
            reporter_id: reporterId,
            target_id: targetId,
            target_type: targetType,
            reason: reason
        });
    }
};
