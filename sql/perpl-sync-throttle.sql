CREATE TABLE IF NOT EXISTS perpl_sync_throttle (
  account_id TEXT PRIMARY KEY,
  next_allowed_at TIMESTAMPTZ NOT NULL
);

CREATE OR REPLACE FUNCTION perpl_claim_sync_slot(
  p_account_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_claimed BOOLEAN;
BEGIN
  IF p_account_id !~ '^[0-9]{1,20}$' THEN
    RAISE EXCEPTION 'Invalid account ID';
  END IF;

  INSERT INTO perpl_sync_throttle (
    account_id,
    next_allowed_at
  )
  VALUES (
    p_account_id,
    NOW() + INTERVAL '5 seconds'
  )
  ON CONFLICT (account_id)
  DO UPDATE SET
    next_allowed_at = EXCLUDED.next_allowed_at
  WHERE perpl_sync_throttle.next_allowed_at <= NOW()
  RETURNING TRUE INTO v_claimed;

  RETURN COALESCE(v_claimed, FALSE);
END;
$$;

CREATE TABLE IF NOT EXISTS perpl_sync_global_throttle (
  bucket TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL
);

CREATE OR REPLACE FUNCTION perpl_claim_global_sync_slot()
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_claimed BOOLEAN;
BEGIN
  INSERT INTO perpl_sync_global_throttle (
    bucket,
    window_start,
    request_count
  )
  VALUES (
    'public-sync',
    NOW(),
    1
  )
  ON CONFLICT (bucket)
  DO UPDATE SET
    window_start = CASE
      WHEN perpl_sync_global_throttle.window_start
           <= NOW() - INTERVAL '1 minute'
      THEN NOW()
      ELSE perpl_sync_global_throttle.window_start
    END,
    request_count = CASE
      WHEN perpl_sync_global_throttle.window_start
           <= NOW() - INTERVAL '1 minute'
      THEN 1
      ELSE perpl_sync_global_throttle.request_count + 1
    END
  WHERE
    perpl_sync_global_throttle.window_start
      <= NOW() - INTERVAL '1 minute'
    OR perpl_sync_global_throttle.request_count < 30
  RETURNING TRUE INTO v_claimed;

  RETURN COALESCE(v_claimed, FALSE);
END;
$$;
