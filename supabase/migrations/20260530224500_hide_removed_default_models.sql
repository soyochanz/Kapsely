insert into public.models (id, label, category, image, image_open, tint, is_active, is_hidden)
values
  ('penguin_kap', 'Penguin', 'Vibe', '', '', '#94A3B8', false, true),
  ('cottoncandy_kap', 'Cotton candy', 'Vibe', '', '', '#F472B6', false, true),
  ('cartoonkap', 'Cartoon', 'Vibe', '', '', '#3B82F6', false, true),
  ('goldenkap', 'Golden', 'Vibe', '', '', '#EAB308', false, true),
  ('model_1772952082826', 'Futuristic', 'Vibe', '', '', '#8B5CF6', false, true)
on conflict (id) do update set
  is_active = false,
  is_hidden = true,
  image = '',
  image_open = '';
