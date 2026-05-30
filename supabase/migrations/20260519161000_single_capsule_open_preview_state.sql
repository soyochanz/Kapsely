alter table public.capsules
    add column if not exists opening_preview_by uuid,
    add column if not exists opening_preview_started_at timestamptz,
    add column if not exists opening_preview_expires_at timestamptz;

create or replace function public.begin_capsule_open_preview_v1(
    target_capsule_id uuid,
    requester_user_id uuid,
    expected_duration_seconds integer default 13
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_owner_id uuid;
    v_status text;
    v_is_opening boolean;
    v_existing_preview_by uuid;
    v_existing_preview_expires_at timestamptz;
    v_preview_expires_at timestamptz;
begin
    select owner_id, status, coalesce(is_opening, false), opening_preview_by, opening_preview_expires_at
    into v_owner_id, v_status, v_is_opening, v_existing_preview_by, v_existing_preview_expires_at
    from public.capsules
    where id = target_capsule_id;

    if not found then
        raise exception 'Capsule not found';
    end if;

    if v_status <> 'sealed' then
        raise exception 'Only sealed capsules can start an opening preview';
    end if;

    if requester_user_id <> v_owner_id then
        raise exception 'Only the owner can start this opening preview';
    end if;

    if v_is_opening then
        return jsonb_build_object(
            'opening_preview_by', v_existing_preview_by,
            'opening_preview_started_at', null,
            'opening_preview_expires_at', coalesce(v_existing_preview_expires_at, now() + interval '1 second'),
            'already_opening', true
        );
    end if;

    if v_existing_preview_by = requester_user_id
       and v_existing_preview_expires_at is not null
       and v_existing_preview_expires_at > now() then
        return jsonb_build_object(
            'opening_preview_by', v_existing_preview_by,
            'opening_preview_started_at', null,
            'opening_preview_expires_at', v_existing_preview_expires_at,
            'already_opening', false
        );
    end if;

    v_preview_expires_at := now() + make_interval(secs => greatest(expected_duration_seconds, 8));

    update public.capsules
    set opening_preview_by = requester_user_id,
        opening_preview_started_at = now(),
        opening_preview_expires_at = v_preview_expires_at
    where id = target_capsule_id;

    return jsonb_build_object(
        'opening_preview_by', requester_user_id,
        'opening_preview_started_at', now(),
        'opening_preview_expires_at', v_preview_expires_at
    );
end;
$$;

create or replace function public.cancel_capsule_open_preview_v1(
    target_capsule_id uuid,
    requester_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.capsules
    set opening_preview_by = null,
        opening_preview_started_at = null,
        opening_preview_expires_at = null
    where id = target_capsule_id
      and opening_preview_by = requester_user_id
      and status = 'sealed'
      and coalesce(is_opening, false) = false;
end;
$$;

create or replace function public.complete_single_capsule_opening_v1(
    target_capsule_id uuid,
    requester_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_owner_id uuid;
    v_status text;
begin
    select owner_id, status
    into v_owner_id, v_status
    from public.capsules
    where id = target_capsule_id;

    if not found then
        raise exception 'Capsule not found';
    end if;

    if requester_user_id <> v_owner_id then
        raise exception 'Only the owner can complete this opening';
    end if;

    if v_status <> 'sealed' then
        return;
    end if;

    update public.capsules
    set status = 'opened',
        is_opening = false,
        opening_at = null,
        opening_preview_by = null,
        opening_preview_started_at = null,
        opening_preview_expires_at = null
    where id = target_capsule_id;
end;
$$;

create or replace function public.cleanup_stale_capsule_open_previews_v1()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_count integer := 0;
begin
    with cleared as (
        update public.capsules
        set opening_preview_by = null,
            opening_preview_started_at = null,
            opening_preview_expires_at = null
        where status = 'sealed'
          and coalesce(is_opening, false) = false
          and opening_preview_expires_at is not null
          and opening_preview_expires_at < now()
        returning id
    )
    select count(*) into v_count from cleared;

    return v_count;
end;
$$;

grant execute on function public.begin_capsule_open_preview_v1(uuid, uuid, integer) to authenticated;
grant execute on function public.cancel_capsule_open_preview_v1(uuid, uuid) to authenticated;
grant execute on function public.complete_single_capsule_opening_v1(uuid, uuid) to authenticated;

do $$
begin
    if exists (select 1 from pg_extension where extname = 'pg_cron') then
        if not exists (select 1 from cron.job where jobname = 'cleanup-stale-capsule-open-previews-v1') then
            perform cron.schedule(
                'cleanup-stale-capsule-open-previews-v1',
                '* * * * *',
                'select public.cleanup_stale_capsule_open_previews_v1();'
            );
        end if;
    end if;
exception
    when others then
        null;
end $$;
