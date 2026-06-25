CREATE TABLE IF NOT EXISTS public.keepalive_pings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pinged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.keepalive_pings ENABLE ROW LEVEL SECURITY;

-- Allow anon to insert and delete so the script can ping it easily
CREATE POLICY "Allow anon insert" ON public.keepalive_pings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon delete" ON public.keepalive_pings FOR DELETE TO anon USING (true);
