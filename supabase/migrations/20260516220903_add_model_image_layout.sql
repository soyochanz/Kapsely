ALTER TABLE public.models
ADD COLUMN IF NOT EXISTS image_scale numeric(5, 2) NOT NULL DEFAULT 1.00,
ADD COLUMN IF NOT EXISTS image_offset_x numeric(6, 2) NOT NULL DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS image_offset_y numeric(6, 2) NOT NULL DEFAULT 0.00;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'models_image_scale_range'
    ) THEN
        ALTER TABLE public.models
        ADD CONSTRAINT models_image_scale_range
        CHECK (image_scale >= 0.50 AND image_scale <= 1.80)
        NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'models_image_offset_x_range'
    ) THEN
        ALTER TABLE public.models
        ADD CONSTRAINT models_image_offset_x_range
        CHECK (image_offset_x >= -80.00 AND image_offset_x <= 80.00)
        NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'models_image_offset_y_range'
    ) THEN
        ALTER TABLE public.models
        ADD CONSTRAINT models_image_offset_y_range
        CHECK (image_offset_y >= -80.00 AND image_offset_y <= 80.00)
        NOT VALID;
    END IF;
END $$;

ALTER TABLE public.models VALIDATE CONSTRAINT models_image_scale_range;
ALTER TABLE public.models VALIDATE CONSTRAINT models_image_offset_x_range;
ALTER TABLE public.models VALIDATE CONSTRAINT models_image_offset_y_range;
