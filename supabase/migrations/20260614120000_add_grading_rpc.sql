-- Create the server-side grading and submission function
CREATE OR REPLACE FUNCTION public.submit_and_grade_responses(
  p_session_id UUID,
  p_participant_name TEXT,
  p_participant_email TEXT,
  p_participant_guest_id UUID,
  p_time_taken_ms INTEGER,
  p_is_disqualified BOOLEAN,
  p_access_token VARCHAR(6),
  p_responses JSONB -- array of objects: [{"question_id": "...", "selected_option": "..."}]
)
RETURNS TABLE (
  inserted_count INTEGER,
  correct_count INTEGER
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_resp JSONB;
  v_question_id UUID;
  v_selected_option TEXT;
  v_correct_index INTEGER;
  v_correct_option TEXT;
  v_options JSONB;
  v_is_correct BOOLEAN;
  v_inserted_rows INTEGER := 0;
  v_correct_rows INTEGER := 0;
BEGIN
  -- First delete any existing responses for this participant in this session to prevent duplicates
  DELETE FROM public.user_responses 
  WHERE session_id = p_session_id 
    AND participant_guest_id = p_participant_guest_id;

  FOR v_resp IN SELECT * FROM jsonb_array_elements(p_responses)
  LOOP
    v_question_id := (v_resp->>'question_id')::UUID;
    v_selected_option := v_resp->>'selected_option';

    -- Retrieve question grading info directly from DB (ensures secure grading)
    SELECT correct_index, correct_option, options 
    INTO v_correct_index, v_correct_option, v_options
    FROM public.questions 
    WHERE id = v_question_id;

    IF v_correct_index IS NULL THEN
       v_correct_index := -1;
    END IF;

    v_is_correct := FALSE;

    IF p_is_disqualified THEN
      -- If cheater, flag remaining unanswered responses
      -- and mark all as incorrect
      IF v_selected_option IS NULL OR v_selected_option = '' OR v_selected_option = 'NO_RESPONSE' THEN
        v_selected_option := 'AUTO_SUBMIT_DQ';
      END IF;
      v_is_correct := FALSE;
    ELSE
      -- Normal grading logic
      IF v_correct_index >= 0 THEN
        IF v_selected_option ~ '^\d+$' AND (v_selected_option::INTEGER) = v_correct_index THEN
          v_is_correct := TRUE;
        ELSE
          -- Check if selected option text matches the text at the correct index
          IF v_options IS NOT NULL AND LOWER(TRIM(v_options->>v_correct_index)) = LOWER(TRIM(v_selected_option)) THEN
            v_is_correct := TRUE;
          END IF;
        END IF;
      ELSE
        -- Fallback to text match against correct_option
        IF LOWER(TRIM(v_selected_option)) = LOWER(TRIM(v_correct_option)) THEN
          v_is_correct := TRUE;
        END IF;
      END IF;
    END IF;

    IF v_is_correct THEN
      v_correct_rows := v_correct_rows + 1;
    END IF;

    INSERT INTO public.user_responses (
      session_id,
      question_id,
      selected_option,
      is_correct,
      participant_name,
      participant_email,
      participant_guest_id,
      time_taken_ms,
      access_token
    ) VALUES (
      p_session_id,
      v_question_id,
      v_selected_option,
      v_is_correct,
      p_participant_name,
      p_participant_email,
      p_participant_guest_id,
      p_time_taken_ms,
      p_access_token
    );

    v_inserted_rows := v_inserted_rows + 1;
  END LOOP;

  RETURN QUERY SELECT v_inserted_rows, v_correct_rows;
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.submit_and_grade_responses(UUID, TEXT, TEXT, UUID, INTEGER, BOOLEAN, VARCHAR(6), JSONB) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_and_grade_responses(UUID, TEXT, TEXT, UUID, INTEGER, BOOLEAN, VARCHAR(6), JSONB) TO authenticated;
