ALTER TABLE public.models
ADD COLUMN IF NOT EXISTS image_scale_x numeric(5, 2) NOT NULL DEFAULT 1.00,
ADD COLUMN IF NOT EXISTS image_scale_y numeric(5, 2) NOT NULL DEFAULT 1.00;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'models_image_scale_x_range'
    ) THEN
        ALTER TABLE public.models
        ADD CONSTRAINT models_image_scale_x_range
        CHECK (image_scale_x >= 0.50 AND image_scale_x <= 1.80)
        NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'models_image_scale_y_range'
    ) THEN
        ALTER TABLE public.models
        ADD CONSTRAINT models_image_scale_y_range
        CHECK (image_scale_y >= 0.50 AND image_scale_y <= 1.80)
        NOT VALID;
    END IF;
END $$;

ALTER TABLE public.models VALIDATE CONSTRAINT models_image_scale_x_range;
ALTER TABLE public.models VALIDATE CONSTRAINT models_image_scale_y_range;
