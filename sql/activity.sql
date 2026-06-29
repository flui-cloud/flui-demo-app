-- Activity feed: the system of record for the demo. Sits alongside the reused
-- Dymmi "logistics" schema; rows are derived from tracking_events on first boot
-- (see activity.seed.sql) and appended live by the manual psql INSERT.

CREATE TABLE IF NOT EXISTS activity (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor      text        NOT NULL,
    action     text        NOT NULL,
    target     text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_created_at ON activity (created_at DESC);

-- AFTER INSERT: announce the new row on the 'feed' channel. The app's pg relay
-- LISTENs on this channel and republishes onto NATS.
CREATE OR REPLACE FUNCTION activity_notify() RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('feed', json_build_object(
        'id',         NEW.id,
        'actor',      NEW.actor,
        'action',     NEW.action,
        'target',     NEW.target,
        'created_at', NEW.created_at
    )::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS activity_after_insert ON activity;
CREATE TRIGGER activity_after_insert
    AFTER INSERT ON activity
    FOR EACH ROW EXECUTE FUNCTION activity_notify();
