-- 084_shifty.sql
-- Shifty, the AutoShift mascot: each person's settings (how lively, sounds) and which tours and
-- page tips they've seen. Saved on their own profile row, which they can already update (RLS).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS shifty JSONB NOT NULL DEFAULT '{}'::jsonb;
