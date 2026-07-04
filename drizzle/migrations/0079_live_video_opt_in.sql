-- Live video is an opt-in add-on; reset auto-assigned liveavatar rows without a face pick.
UPDATE wireline_agents
SET video_presenter_provider = 'synthetic',
    video_presenter_consent_status = 'not_started'
WHERE video_presenter_provider IN ('liveavatar', 'heygen')
  AND video_presenter_avatar_id IS NULL;
