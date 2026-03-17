import { supabase } from '../lib/supabase';

export type ReportType = 'user' | 'capsule' | 'capsule_item' | 'comment' | 'chat_message';

export const safetyService = {
    async blockUser(blockerId: string, blockedId: string) {
        return await supabase.from('blocks').insert({
            blocker_id: blockerId,
            blocked_id: blockedId
        });
    },

    async unblockUser(blockerId: string, blockedId: string) {
        return await supabase.from('blocks').delete()
            .eq('blocker_id', blockerId)
            .eq('blocked_id', blockedId);
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
        const [blockedByMe, blockingMe] = await Promise.all([
            supabase.from('blocks').select('blocked_id').eq('blocker_id', userId),
            supabase.from('blocks').select('blocker_id').eq('blocked_id', userId)
        ]);

        const ids = new Set([
            ...(blockedByMe.data || []).map(b => b.blocked_id),
            ...(blockingMe.data || []).map(b => b.blocker_id)
        ]);
        return Array.from(ids);
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
