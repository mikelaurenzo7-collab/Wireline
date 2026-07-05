-- Vapi monitor.listenUrl for live PSTN audio tap (presenter lip-sync bridge).
ALTER TABLE wireline_signal_presence
  ADD COLUMN IF NOT EXISTS listen_url text;

COMMENT ON COLUMN wireline_signal_presence.listen_url IS
  'Vapi monitor.listenUrl — live PCM stream for in-call presenter lip-sync';
