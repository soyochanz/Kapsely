alter table public.birthday_congratulations
  add column if not exists gift_type text not null default 'cake';

alter table public.models
  add column if not exists is_new boolean not null default false,
  add column if not exists is_trending boolean not null default false,
  add column if not exists is_event boolean not null default false,
  add column if not exists is_birthday boolean not null default false,
  add column if not exists event_start timestamptz,
  add column if not exists event_end timestamptz,
  add column if not exists event_title text,
  add column if not exists event_description text,
  add column if not exists drop_id text;

alter table public.capsules
  add column if not exists model_snapshot jsonb;

insert into public.models (
  id, label, category, image, image_open, tint, is_active, is_birthday, is_new
) values (
  'birthday_candy_kap',
  'Birthday Candy',
  'Birthday',
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="%23ff7adf"/><stop offset=".48" stop-color="%23a78bfa"/><stop offset="1" stop-color="%2367e8f9"/></linearGradient><radialGradient id="r" cx=".35" cy=".25" r=".8"><stop stop-color="%23fff" stop-opacity=".9"/><stop offset=".35" stop-color="%23fff" stop-opacity=".15"/><stop offset="1" stop-color="%23fff" stop-opacity="0"/></radialGradient></defs><rect width="512" height="512" rx="112" fill="%23fff5ff"/><circle cx="88" cy="96" r="10" fill="%23ffd166"/><circle cx="424" cy="126" r="8" fill="%23ff70a6"/><circle cx="400" cy="390" r="12" fill="%2367e8f9"/><path d="M118 290c0-84 61-142 145-142s145 58 145 142c0 72-54 116-145 116s-145-44-145-116z" fill="url(%23g)"/><path d="M141 260c55-70 155-112 235-42 22 19 27 56 7 83-54 73-173 84-239 23-18-16-20-43-3-64z" fill="%23fff" opacity=".22"/><path d="M146 235c42-82 136-137 218-95 44 23 54 84 20 121-69 76-194 75-238 15-8-11-7-28 0-41z" fill="url(%23g)"/><path d="M159 225c48-66 124-93 184-67 24 10 34 40 20 63-41 65-151 87-202 36-9-9-10-22-2-32z" fill="url(%23r)"/><path d="M194 160l20-39 20 39 43 7-31 30 7 43-39-20-38 20 7-43-31-30 42-7z" fill="%23ffd166"/><path d="M316 124l13-25 13 25 28 4-20 20 5 28-26-13-25 13 5-28-21-20 28-4z" fill="%23ff70a6"/></svg>',
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="%23ff7adf"/><stop offset=".48" stop-color="%23a78bfa"/><stop offset="1" stop-color="%2367e8f9"/></linearGradient></defs><rect width="512" height="512" rx="112" fill="%23fff5ff"/><path d="M117 316c8-80 68-126 149-126s137 46 146 126c6 58-43 98-146 98s-155-40-149-98z" fill="url(%23g)"/><path d="M136 196c37-74 115-116 189-92 63 20 85 93 41 142-57 64-170 70-225 15-18-18-17-43-5-65z" fill="url(%23g)" opacity=".93"/><path d="M173 190c44-51 107-70 153-49 20 9 27 34 13 52-38 50-120 64-163 25-8-7-9-19-3-28z" fill="%23fff" opacity=".4"/><circle cx="178" cy="98" r="13" fill="%23ffd166"/><circle cx="350" cy="96" r="10" fill="%23ff70a6"/><circle cx="416" cy="196" r="7" fill="%2367e8f9"/><path d="M209 132l18-35 18 35 38 6-28 27 7 38-35-18-34 18 6-38-28-27 38-6z" fill="%23ffd166"/></svg>',
  '#ff7adf',
  true,
  true,
  true
) on conflict (id) do update set
  label = excluded.label,
  category = excluded.category,
  image = excluded.image,
  image_open = excluded.image_open,
  tint = excluded.tint,
  is_active = true,
  is_birthday = true,
  is_new = true;

insert into public.model_configs (model_id, config)
values (
  'birthday_candy_kap',
  '{"x":0.35,"y":0.42,"w":0.3,"h":0.1,"color":"#ffffff","fontId":"monospace","format":"standard","curvature":0,"themeColor":"#ff7adf","faceX":0.5,"faceY":0.54,"faceScale":1,"showFace":true}'::jsonb
) on conflict (model_id) do nothing;
