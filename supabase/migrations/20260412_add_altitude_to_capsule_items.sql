-- Migration to add location columns to capsule_items table
ALTER TABLE public.capsule_items
ADD COLUMN IF NOT EXISTS latitude double precision,
ADD COLUMN IF NOT EXISTS longitude double precision,
ADD COLUMN IF NOT EXISTS location_name text,
ADD COLUMN IF NOT EXISTS altitude double precision;
