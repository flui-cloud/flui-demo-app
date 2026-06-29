-- Derive the initial activity feed from the reused Dymmi logistics dataset:
-- every parcel tracking scan becomes one activity row
--   actor  = the carrier that moved the parcel
--   action = the scan type (picked_up, in_transit, delivered, ...)
--   target = the parcel tracking number
-- Run once, only when the activity table is still empty.
INSERT INTO activity (actor, action, target, created_at)
SELECT
    btrim(c.name)        AS actor,
    te.event_type::text  AS action,
    s.tracking_number    AS target,
    te.event_at          AS created_at
FROM tracking_events te
JOIN shipments s ON s.id = te.shipment_id
JOIN carriers  c ON c.id = s.carrier_id
ORDER BY te.event_at;
