alter table public.models
    add column if not exists is_hidden boolean not null default false;

alter table public.models
    add column if not exists effect_type text not null default 'none',
    add column if not exists effect_tint text,
    add column if not exists effect_scale numeric not null default 1,
    add column if not exists effect_offset_x numeric not null default 0,
    add column if not exists effect_offset_y numeric not null default 0,
    add column if not exists effect_opacity numeric not null default 1,
    add column if not exists effect_layer text not null default 'behind';

update public.models
set effect_tint = coalesce(effect_tint, tint, '#a269ff')
where effect_tint is null;
