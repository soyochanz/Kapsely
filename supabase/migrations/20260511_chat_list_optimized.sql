CREATE OR REPLACE FUNCTION public.get_chat_list_data()
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_chats JSONB;
BEGIN
    SELECT COALESCE(jsonb_agg(row_to_json(chat_row)::jsonb ORDER BY chat_row.sort_at DESC), '[]'::jsonb)
    INTO v_chats
    FROM (
        SELECT
            c.id AS conversation_id,
            c.is_group,
            c.name,
            c.avatar_url,
            COALESCE(last_msg.created_at, c.last_message_at) AS sort_at,
            CASE
                WHEN c.is_group THEN jsonb_build_object(
                    'display_name', COALESCE(c.name, 'Grupo'),
                    'avatar_url', c.avatar_url
                )
                ELSE jsonb_build_object(
                    'id', p.id,
                    'username', p.username,
                    'display_name', p.display_name,
                    'avatar_url', p.avatar_url,
                    'favorite_color', p.favorite_color
                )
            END AS other_user,
            CASE
                WHEN last_msg.id IS NULL THEN NULL
                ELSE jsonb_build_object(
                    'id', last_msg.id,
                    'conversation_id', last_msg.conversation_id,
                    'content', last_msg.content,
                    'created_at', last_msg.created_at,
                    'sender_id', last_msg.sender_id,
                    'is_read', last_msg.is_read,
                    'media_type', last_msg.media_type
                )
            END AS last_message,
            COALESCE(unread.count, 0) AS unread_count
        FROM conversation_participants me
        JOIN conversations c ON c.id = me.conversation_id
        LEFT JOIN LATERAL (
            SELECT m.id, m.conversation_id, m.content, m.created_at, m.sender_id, m.is_read, m.media_type
            FROM messages m
            WHERE m.conversation_id = c.id
            ORDER BY m.created_at DESC
            LIMIT 1
        ) last_msg ON true
        LEFT JOIN LATERAL (
            SELECT cp.user_id
            FROM conversation_participants cp
            WHERE cp.conversation_id = c.id
              AND cp.user_id <> v_user_id
            ORDER BY cp.user_id
            LIMIT 1
        ) other_participant ON true
        LEFT JOIN profiles p ON p.id = other_participant.user_id
        LEFT JOIN LATERAL (
            SELECT COUNT(*) AS count
            FROM messages m
            WHERE m.conversation_id = c.id
              AND m.sender_id <> v_user_id
              AND m.is_read = false
        ) unread ON true
        WHERE me.user_id = v_user_id
    ) chat_row;

    RETURN jsonb_build_object('chats', v_chats);
END;
$$ LANGUAGE plpgsql STABLE;

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
    ON public.messages(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_conversation
    ON public.conversation_participants(user_id, conversation_id);
