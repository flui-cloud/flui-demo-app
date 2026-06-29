-- Sample schema: logistics — parcel shipping / warehousing (demo dataset).
-- PostgreSQL 16. Fields, comments and ENUM tokens are English; seed data uses
-- realistic Italian identities (carrier/customer company names, VAT, cities).
-- ENUM/CHECK constraints, FK graph, COMMENTs and indexes included.

-- =========================================================================
--  ENUM types  — declared value vocabularies (Tier A)
-- =========================================================================
CREATE TYPE vehicle_type    AS ENUM ('van', 'truck', 'motorbike');
CREATE TYPE shipment_status AS ENUM ('created', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'returned', 'lost');
CREATE TYPE priority_level  AS ENUM ('economy', 'standard', 'express');
CREATE TYPE event_type      AS ENUM ('picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned');

-- =========================================================================
--  warehouses
-- =========================================================================
CREATE TABLE warehouses (
    id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        varchar(80) NOT NULL UNIQUE,
    city        varchar(80) NOT NULL,
    province    char(2)     NOT NULL,
    capacity_m3 integer     NOT NULL,
    CONSTRAINT warehouses_capacity_pos CHECK (capacity_m3 > 0)
);
COMMENT ON TABLE  warehouses             IS 'Distribution warehouses shipments depart from.';
COMMENT ON COLUMN warehouses.capacity_m3 IS 'Storage capacity in cubic metres.';

-- =========================================================================
--  carriers
-- =========================================================================
CREATE TABLE carriers (
    id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name       varchar(120) NOT NULL,
    vat_number char(11)     NOT NULL UNIQUE,
    phone      varchar(20),
    is_active  boolean      NOT NULL DEFAULT true,
    CONSTRAINT carriers_vat_format CHECK (vat_number ~ '^[0-9]{11}$')
);
COMMENT ON TABLE  carriers            IS 'Shipping companies that move parcels.';
COMMENT ON COLUMN carriers.vat_number IS 'Italian VAT number (Partita IVA), 11 digits.';

-- =========================================================================
--  vehicles
-- =========================================================================
CREATE TABLE vehicles (
    id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    carrier_id   integer      NOT NULL REFERENCES carriers (id) ON DELETE CASCADE,
    plate        varchar(10)  NOT NULL UNIQUE,
    type         vehicle_type NOT NULL,
    capacity_kg  integer      NOT NULL,
    CONSTRAINT vehicles_capacity_pos CHECK (capacity_kg > 0)
);
COMMENT ON TABLE vehicles IS 'Vehicles owned by carriers.';

-- =========================================================================
--  customers  — shipment recipients (companies)
-- =========================================================================
CREATE TABLE customers (
    id       integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name     varchar(120) NOT NULL,
    city     varchar(80)  NOT NULL,
    province char(2)      NOT NULL,
    email    varchar(160),
    phone    varchar(20)
);
COMMENT ON TABLE customers IS 'Recipients of shipments (business customers).';

-- =========================================================================
--  shipments
-- =========================================================================
CREATE TABLE shipments (
    id                  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tracking_number     varchar(20)     NOT NULL UNIQUE,
    carrier_id          integer         NOT NULL REFERENCES carriers (id),
    origin_warehouse_id integer         NOT NULL REFERENCES warehouses (id),
    customer_id         integer         NOT NULL REFERENCES customers (id),
    status              shipment_status NOT NULL DEFAULT 'created',
    priority            priority_level  NOT NULL DEFAULT 'standard',
    weight_kg           numeric(8,2)    NOT NULL,
    cost                numeric(10,2)   NOT NULL DEFAULT 0,
    dest_city           varchar(80)     NOT NULL,
    dest_province       char(2)         NOT NULL,
    shipped_at          timestamptz,
    delivered_at        timestamptz,
    CONSTRAINT shipments_weight_pos    CHECK (weight_kg > 0),
    CONSTRAINT shipments_cost_nn       CHECK (cost >= 0),
    CONSTRAINT shipments_delivered_after CHECK (delivered_at IS NULL OR shipped_at IS NULL OR delivered_at >= shipped_at)
);
COMMENT ON TABLE  shipments              IS 'Parcels handed to a carrier from a warehouse to a customer.';
COMMENT ON COLUMN shipments.tracking_number IS 'Unique carrier tracking code.';
COMMENT ON COLUMN shipments.weight_kg    IS 'Total parcel weight in kilograms.';
COMMENT ON COLUMN shipments.delivered_at IS 'When delivered; NULL if not yet delivered. Always >= shipped_at.';

-- =========================================================================
--  shipment_items
-- =========================================================================
CREATE TABLE shipment_items (
    id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    shipment_id integer      NOT NULL REFERENCES shipments (id) ON DELETE CASCADE,
    description varchar(120) NOT NULL,
    quantity    integer      NOT NULL,
    weight_kg   numeric(8,2) NOT NULL,
    CONSTRAINT shipment_items_qty_pos    CHECK (quantity >= 1),
    CONSTRAINT shipment_items_weight_pos CHECK (weight_kg > 0)
);
COMMENT ON TABLE shipment_items IS 'Goods contained in a shipment.';

-- =========================================================================
--  tracking_events
-- =========================================================================
CREATE TABLE tracking_events (
    id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    shipment_id   integer     NOT NULL REFERENCES shipments (id) ON DELETE CASCADE,
    event_type    event_type  NOT NULL,
    location_city varchar(80),
    event_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE tracking_events IS 'Scan/tracking events recorded along a shipment journey.';

-- =========================================================================
--  routes
-- =========================================================================
CREATE TABLE routes (
    id                  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    origin_warehouse_id integer     NOT NULL REFERENCES warehouses (id),
    dest_city           varchar(80) NOT NULL,
    dest_province       char(2)     NOT NULL,
    distance_km         integer     NOT NULL,
    estimated_days      integer     NOT NULL,
    CONSTRAINT routes_distance_pos CHECK (distance_km > 0),
    CONSTRAINT routes_days_pos     CHECK (estimated_days > 0)
);
COMMENT ON TABLE routes IS 'Predefined delivery routes from a warehouse to a destination.';

-- =========================================================================
--  indexes
-- =========================================================================
CREATE INDEX idx_vehicles_carrier        ON vehicles (carrier_id);
CREATE INDEX idx_shipments_carrier       ON shipments (carrier_id);
CREATE INDEX idx_shipments_warehouse     ON shipments (origin_warehouse_id);
CREATE INDEX idx_shipments_customer      ON shipments (customer_id);
CREATE INDEX idx_shipments_status        ON shipments (status);
CREATE INDEX idx_shipments_shipped_at    ON shipments (shipped_at);
CREATE INDEX idx_shipment_items_shipment ON shipment_items (shipment_id);
CREATE INDEX idx_tracking_shipment       ON tracking_events (shipment_id);
CREATE INDEX idx_routes_warehouse        ON routes (origin_warehouse_id);
