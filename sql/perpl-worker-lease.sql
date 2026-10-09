CREATE TABLE IF NOT EXISTS perpl_worker_leases (
  account_id TEXT PRIMARY KEY,
  lease_token UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE OR REPLACE FUNCTION perpl_acquire_worker_lease(
  p_account_id TEXT,
  p_token UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_acquired BOOLEAN;
BEGIN
  IF p_account_id !~ '^[0-9]{1,20}$'
     OR p_token IS NULL THEN
    RAISE EXCEPTION 'Invalid worker lease parameters';
  END IF;

  INSERT INTO perpl_worker_leases (
    account_id,
    lease_token,
    expires_at
  )
  VALUES (
    p_account_id,
    p_token,
    NOW() + INTERVAL '90 seconds'
  )
  ON CONFLICT (account_id)
  DO UPDATE SET
    lease_token = EXCLUDED.lease_token,
    expires_at = EXCLUDED.expires_at
  WHERE perpl_worker_leases.expires_at < NOW()
  RETURNING TRUE INTO v_acquired;

  RETURN COALESCE(v_acquired, FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION perpl_release_worker_lease(
  p_account_id TEXT,
  p_token UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_released BOOLEAN;
BEGIN
  DELETE FROM perpl_worker_leases
  WHERE account_id = p_account_id
    AND lease_token = p_token
  RETURNING TRUE INTO v_released;

  RETURN COALESCE(v_released, FALSE);
END;
$$;
