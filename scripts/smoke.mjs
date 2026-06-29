// Smoke test for the full chain: INSERT on Postgres -> pg_notify -> NATS ->
// Redis -> SSE. Subscribes to /sse, inserts one row, and asserts that exact
// row arrives as an SSE 'update' within the deadline.
//   node scripts/smoke.mjs            (app at http://localhost:3000)
//   APP_URL=http://host:3000 node scripts/smoke.mjs
import http from 'node:http';
import pg from 'pg';

const { Client } = pg;
const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';
const DEADLINE_MS = 5000;
const marker = 'SMOKE-' + Date.now();

function listenSse(onUpdate) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${APP_URL}/sse`, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`SSE ${res.statusCode}`));
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = {};
          for (const line of block.split('\n')) {
            const c = line.indexOf(':');
            if (c < 0) continue;
            const k = line.slice(0, c).trim();
            const v = line.slice(c + 1).trim();
            if (k === 'event') ev.event = v;
            if (k === 'data') ev.data = v;
          }
          if (ev.event === 'update' && ev.data) onUpdate(JSON.parse(ev.data));
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    resolve(() => req.destroy());
  });
}

const client = new Client(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.PGHOST ?? 'localhost',
        port: Number(process.env.PGPORT ?? 5432),
        user: process.env.PGUSER ?? 'demo',
        password: process.env.PGPASSWORD ?? 'demo',
        database: process.env.PGDATABASE ?? 'demo',
      },
);

let received = false;
const done = new Promise((resolve) => {
  listenSse((u) => {
    if (u.row?.target === marker) { received = true; resolve(); }
  }).then((close) => done.close = close);
});

await client.connect();
// give the SSE stream a moment to attach before the INSERT
await new Promise((r) => setTimeout(r, 500));
await client.query(
  "INSERT INTO activity (actor, action, target) VALUES ('Smoke Test', 'delivered', $1)",
  [marker],
);

const timeout = new Promise((_, rej) =>
  setTimeout(() => rej(new Error('timeout: no SSE update for the inserted row')), DEADLINE_MS),
);

try {
  await Promise.race([done, timeout]);
  console.log(`OK — INSERT -> SSE chain delivered ${marker}`);
  process.exitCode = 0;
} catch (e) {
  console.error(`FAIL — ${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
  done.close?.();
  process.exit(process.exitCode);
}
