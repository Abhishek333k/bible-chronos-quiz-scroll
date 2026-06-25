ALTER TABLE public.session_tokens ADD COLUMN IF NOT EXISTS draft_state JSONB DEFAULT NULL;

CREATE OR REPLACE FUNCTION public.save_session_draft(p_access_token VARCHAR(6), p_draft_state JSONB)
RETURNS VOID AS $$
BEGIN
  UPDATE public.session_tokens
  SET draft_state = p_draft_state
  WHERE access_token = p_access_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.save_session_draft TO anon;
GRANT EXECUTE ON FUNCTION public.save_session_draft TO authenticated;
