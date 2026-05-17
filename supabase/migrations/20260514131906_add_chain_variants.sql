-- Add two active pendant chain variants with the same placement profile as Punk Rabbit.

WITH new_chains(id, name, image_url, thumbnail_url, is_active) AS (
    VALUES
    (
        'neonrabbit_chain',
        'Neon Rabbit',
        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="%2300F2FF"/><stop offset="1" stop-color="%23A66EFF"/></linearGradient><filter id="s" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="%23000" flood-opacity=".28"/></filter></defs><path d="M256 34c-42 0-78 34-78 76v82h28v-82c0-27 22-50 50-50s50 23 50 50v82h28v-82c0-42-36-76-78-76Z" fill="%23261B45"/><g filter="url(%23s)"><path d="M141 188c-20 16-31 42-25 67l29 121c7 30 34 51 65 51h92c31 0 58-21 65-51l29-121c6-25-5-51-25-67l-42-34c-12-10-29-12-44-6l-29 12-29-12c-15-6-32-4-44 6l-42 34Z" fill="url(%23g)"/><path d="M186 196l-12-83c-3-20 19-34 35-22l52 39-75 66Zm140 0 12-83c3-20-19-34-35-22l-52 39 75 66Z" fill="%23150F2D"/><circle cx="216" cy="278" r="18" fill="%23fff"/><circle cx="296" cy="278" r="18" fill="%23fff"/><circle cx="222" cy="282" r="8" fill="%23150F2D"/><circle cx="302" cy="282" r="8" fill="%23150F2D"/><path d="M230 337c16 15 36 15 52 0" fill="none" stroke="%23150F2D" stroke-width="15" stroke-linecap="round"/><path d="M179 242c52-27 102-27 154 0" fill="none" stroke="%23fff" stroke-opacity=".34" stroke-width="12" stroke-linecap="round"/></g></svg>',
        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><rect width="160" height="160" rx="34" fill="%23150F2D"/><path d="M80 18c-16 0-29 13-29 29v25h11V47c0-10 8-19 18-19s18 9 18 19v25h11V47c0-16-13-29-29-29Z" fill="%23fff" opacity=".75"/><path d="M45 65c-7 6-11 15-9 24l10 39c3 10 12 17 23 17h22c11 0 20-7 23-17l10-39c2-9-2-18-9-24L99 52 80 60 61 52 45 65Z" fill="%2300F2FF"/><circle cx="66" cy="94" r="6" fill="%23150F2D"/><circle cx="94" cy="94" r="6" fill="%23150F2D"/></svg>',
        true
    ),
    (
        'starbunny_chain',
        'Star Bunny',
        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="%23FFD166"/><stop offset="1" stop-color="%23FF4D8D"/></linearGradient><filter id="s" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="%23000" flood-opacity=".25"/></filter></defs><path d="M256 34c-42 0-78 34-78 76v82h28v-82c0-27 22-50 50-50s50 23 50 50v82h28v-82c0-42-36-76-78-76Z" fill="%232B1937"/><g filter="url(%23s)"><path d="M134 203c-17 18-23 44-15 68l38 111c10 28 36 46 66 46h66c30 0 56-18 66-46l38-111c8-24 2-50-15-68l-44-46c-12-13-32-17-48-9l-30 14-30-14c-16-8-36-4-48 9l-44 46Z" fill="url(%23g)"/><path d="M185 197l-22-82c-5-20 16-37 34-27l60 33-72 76Zm142 0 22-82c5-20-16-37-34-27l-60 33 72 76Z" fill="%23FFF3B0"/><path d="m256 216 18 39 42 5-31 29 8 42-37-21-37 21 8-42-31-29 42-5 18-39Z" fill="%23fff" opacity=".92"/><circle cx="216" cy="292" r="15" fill="%232B1937"/><circle cx="296" cy="292" r="15" fill="%232B1937"/><path d="M231 352c14 11 36 11 50 0" fill="none" stroke="%232B1937" stroke-width="14" stroke-linecap="round"/></g></svg>',
        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><rect width="160" height="160" rx="34" fill="%232B1937"/><path d="M80 18c-16 0-29 13-29 29v25h11V47c0-10 8-19 18-19s18 9 18 19v25h11V47c0-16-13-29-29-29Z" fill="%23fff" opacity=".75"/><path d="M42 70c-6 7-8 17-5 26l12 35c4 9 12 15 22 15h18c10 0 18-6 22-15l12-35c3-9 1-19-5-26l-17-18-21 10-21-10-17 18Z" fill="%23FFD166"/><path d="m80 75 8 17 19 3-14 13 4 19-17-10-17 10 4-19-14-13 19-3 8-17Z" fill="%23fff"/></svg>',
        true
    )
)
INSERT INTO public.chains(id, name, image_url, thumbnail_url, is_active)
SELECT id, name, image_url, thumbnail_url, is_active
FROM new_chains
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    image_url = EXCLUDED.image_url,
    thumbnail_url = EXCLUDED.thumbnail_url,
    is_active = EXCLUDED.is_active;

INSERT INTO public.model_chain_configs(model_id, chain_id, x, y, scale)
SELECT p.model_id, c.chain_id, p.x, p.y, p.scale
FROM public.model_chain_configs p
CROSS JOIN (VALUES ('neonrabbit_chain'), ('starbunny_chain')) AS c(chain_id)
WHERE p.chain_id = 'punkrabbit_chain'
ON CONFLICT (model_id, chain_id) DO UPDATE SET
    x = EXCLUDED.x,
    y = EXCLUDED.y,
    scale = EXCLUDED.scale;
