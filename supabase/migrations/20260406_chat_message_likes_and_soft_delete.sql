-- Message-level likes + per-user soft delete support

alter table if exists public.messages
    add column if not exists deleted_for uuid[] not null default '{}'::uuid[];

create table if not exists public.message_likes (
    message_id uuid not null references public.messages(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (message_id, user_id)
);

alter table public.message_likes enable row level security;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'message_likes'
          and policyname = 'message_likes_select_participant'
    ) then
        create policy message_likes_select_participant on public.message_likes
            for select
            using (
                exists (
                    select 1
                    from public.messages m
                    join public.conversation_participants cp
                      on cp.conversation_id = m.conversation_id
                    where m.id = message_likes.message_id
                      and cp.user_id = auth.uid()
                )
            );
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'message_likes'
          and policyname = 'message_likes_insert_own'
    ) then
        create policy message_likes_insert_own on public.message_likes
            for insert
            with check (
                user_id = auth.uid()
                and exists (
                    select 1
                    from public.messages m
                    join public.conversation_participants cp
                      on cp.conversation_id = m.conversation_id
                    where m.id = message_likes.message_id
                      and cp.user_id = auth.uid()
                )
            );
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'message_likes'
          and policyname = 'message_likes_delete_own'
    ) then
        create policy message_likes_delete_own on public.message_likes
            for delete
            using (user_id = auth.uid());
    end if;
end $$;
