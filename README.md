# Flui Live Activity — demo app

A small reference application for [Flui](https://flui.cloud), built around one
artifact: its [**`flui.yaml`**](./flui.yaml). The manifest declares a whole
reactive stack — **app + Postgres + Redis + NATS** — as a single composed
catalog app. Install it and Flui provisions all four together, generates and
injects the database/cache secrets, and gives the app a public HTTPS endpoint.
The app itself proves the components are real: a raw `INSERT` on Postgres reaches
the browser in ~1s with no polling and no refresh.

If you only read one file here, read [`flui.yaml`](./flui.yaml).

## The `flui.yaml` is the point

`flui.yaml` is the deploy contract — a Flui catalog manifest validated against the
published [`@flui-cloud/spec`](https://www.npmjs.com/package/@flui-cloud/spec)
schema. You describe **intent**; Flui renders the workloads, services, secrets,
storage, TLS and capacity checks. There are no Kubernetes objects to write.

```yaml
kind: CatalogApp          # a catalog entry
apiVersion: flui/v1
spec:
  type: composed          # several components, one atomic install + teardown
  components:
    - name: postgres      # ─┐
    - name: redis         #  ├─ each becomes a workload + Service on an internal network
    - name: nats          #  │
    - name: app           # ─┘ the only one exposed publicly
```

### How the spec wires the stack

| Spec feature | In this manifest | What Flui does |
| --- | --- | --- |
| `spec.type: composed` | 4 components | installs/tears them down as one application |
| `ports[].expose: true` | only `app` (3000) | gives that component a public hostname + TLS (`domain`) |
| `networking.internal` | `demo.internal` | every component is reachable at `{{components.<name>.host}}` |
| `dependsOn` | `app → [postgres, redis, nats]` | orders startup until backends are ready |
| `volumes` + `persistence.scope: dedicated` | postgres, redis, nats | stateful workloads with durable storage |
| `env[].valueFrom.generate` | DB & cache passwords | generates a random Secret — **plaintext never enters the manifest** |
| Templating `{{…}}` | app env | resolves wiring at install time (see below) |
| `resources` | every component | feeds the capacity gate (admit only if it fits) |
| `scaling` (HPA/VPA) | per component | autoscaling policy |
| `healthcheck` (exec/http/tcp) | every component | readiness/liveness probes |
| `smokeTest` | http `/health` | install is healthy only once this passes |

### The templating engine

Values in `{{…}}` are resolved when the app is installed:

| Expression | Resolves to |
| --- | --- |
| `{{app.id}}` | the install slug (used as the DB name/user) |
| `{{env.POSTGRES_USER}}` | another env var **of the same component** |
| `{{components.postgres.host}}` | a component's stable in-cluster hostname |
| `{{components.postgres.env.POSTGRES_PASSWORD}}` | another component's value — and when it was a generated secret, it's injected as a **Secret reference**, not plaintext |

That last row is the whole trick: the app receives the real database password at
runtime without it ever being written down in the manifest. The
[`flui.yaml`](./flui.yaml) is annotated inline so each of these reads as a worked
example of the spec.

## What the app does

The manifest only describes the stack; the app proves all three backends are
genuinely in the data path:

```
INSERT activity ─▶ Postgres  (AFTER INSERT trigger → pg_notify 'feed')
                      │  LISTEN feed
                      ▼
                   relay ──▶ NATS  (subject: feed.new)
                                      │  subscribe
                                      ▼
                                  consumer ──▶ Redis  (hot feed · counter · top actions)
                                                  │
                                                  ▼
                                            SSE /sse ──▶ browser  (counter · bars · feed)
```

The relay, consumer, API and SSE endpoint live in one service ([`src/`](./src));
the page is a single static HTML file with CSS-animated bars — no charting
library, no frontend framework. The `activity` table is seeded on first boot
from a bundled [sample *logistics*](./sql) dataset; an in-app generator then adds
rows continuously so the page stays alive.

## Install on Flui

Installing the manifest provisions all four components as one application:

1. Build & publish the app image to the `image:` ref in `flui.yaml`
   (`ghcr.io/flui-cloud/flui-demo-app`).
2. Install the catalog app — Flui creates Postgres, Redis, NATS and the app,
   generates the secrets, wires the env, and exposes the app over HTTPS.

The same manifest is registered as a catalog seed in flui-core
(`src/modules/catalog/seed/flui-demo-activity.flui.yaml`), marked `draft: true`
until the image is published.

## Run locally

[`docker-compose.yml`](./docker-compose.yml) mirrors the manifest's four
components so you can iterate without a cluster:

```bash
docker compose up --build
# open http://localhost:3000
```

On boot the app loads the logistics schema and seed, creates the `activity`
table and trigger, derives the feed, rebuilds the Redis projection, then wires
the live relay and consumer. The counter, bars and feed come up populated.

### Watch a single change travel the chain

The page moves on its own (an in-app generator). To isolate one change, pause the
generator and insert a row while watching the untouched browser:

```bash
curl -X POST http://localhost:3000/generator/stop
docker compose exec -T postgres psql -U demo -d demo \
  -c "INSERT INTO activity (actor, action, target) VALUES ('DHL Express', 'delivered', 'TRK-99001');"
```

Within ~1s the counter ticks up, the `delivered` bar grows and reorders, and the
new row appears at the top of the feed. Resume with `POST /generator/start`.

### Smoke test

Verifies the full `INSERT → SSE` chain against a running stack:

```bash
npm install
DATABASE_URL=postgres://demo:demo@localhost:5432/demo npm run smoke
# OK — INSERT -> SSE chain delivered SMOKE-...
```

## Configuration

Connections accept either a single URL or discrete variables (see
[`.env.example`](./.env.example)):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` or `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`/`PGDATABASE` | Postgres |
| `REDIS_URL` or `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD` | Redis |
| `NATS_URL` or `NATS_HOST`/`NATS_PORT` | NATS |
| `FEED_MAX` | rows kept in the hot feed (default 50) |
| `GENERATOR_ENABLED` / `GENERATOR_MIN_MS` / `GENERATOR_MAX_MS` | ambient traffic |

In a Flui install these are filled by the manifest's templating; locally,
`docker-compose.yml` sets them.

## Built on a Flui template

The service is scaffolded from
[`flui-template-nestjs-11`](../flui-template-nestjs-11) — same Dockerfile
conventions, `/health` endpoint and layout.

## Project layout

```
flui.yaml             ← the deploy contract (start here)
src/                  app service: pg relay, NATS consumer, Redis store, SSE
public/index.html     single-page UI (counter · bars · feed)
sql/                  activity table + trigger, reused logistics dataset
scripts/              seed + smoke helpers
docker-compose.yml    local mirror of the manifest
```
