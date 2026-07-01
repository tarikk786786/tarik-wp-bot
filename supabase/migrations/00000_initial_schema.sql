CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY, -- WhatsApp Phone Number
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ai_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_memory ENABLE ROW LEVEL SECURITY;

-- Since the backend uses the Service Role / Secret Key, we can bypass RLS, but we'll add policies for safety.
CREATE POLICY "Service Role Full Access" ON public.users USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access" ON public.ai_memory USING (true) WITH CHECK (true);
