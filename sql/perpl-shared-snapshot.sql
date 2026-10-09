CREATE TABLE IF NOT EXISTS perpl_account_snapshots (
  account_id TEXT PRIMARY KEY,
  target_block_number NUMERIC(78, 0) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION perpl_get_or_create_account_snapshot(
  p_account_id TEXT,
  p_proposed_target NUMERIC
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_target NUMERIC;
BEGIN
  IF p_account_id !~ '^[0-9]+$'
     OR p_proposed_target IS NULL
     OR p_proposed_target < 0
     OR p_proposed_target <> TRUNC(p_proposed_target) THEN
    RAISE EXCEPTION 'Invalid account snapshot parameters';
  END IF;

  INSERT INTO perpl_account_snapshots (
    account_id,
    target_block_number
  )
  VALUES (
    p_account_id,
    GREATEST(
      p_proposed_target,
      COALESCE(
        (
          SELECT MAX(target_block_number)
          FROM perpl_historical_sync
          WHERE account_id = p_account_id
        ),
        0
      )
    )
  )
  ON CONFLICT (account_id) DO NOTHING;

  SELECT target_block_number
  INTO v_target
  FROM perpl_account_snapshots
  WHERE account_id = p_account_id;

  RETURN v_target::TEXT;
END;
$$;
