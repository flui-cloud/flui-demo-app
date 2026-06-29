// Spray random activity rows so you can watch the feed move during a recording.
//   node scripts/seed.mjs [count] [delayMs]
// Defaults: 20 rows, 150ms apart. Connects via DATABASE_URL or PG* env vars.
import pg from 'pg';

const { Client } = pg;
const count = Number(process.argv[2] ?? 20);
const delayMs = Number(process.argv[3] ?? 150);

const CARRIERS = [
  'DHL Express', 'BRT', 'GLS', 'TNT', 'Poste Italiane', 'SDA', 'UPS', 'FedEx',
];
const ACTIONS = [
  'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned',
];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const trk = () => 'TRK-' + Math.floor(10000 + Math.random() * 89999);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

await client.connect();
for (let i = 0; i < count; i++) {
  const actor = pick(CARRIERS);
  const action = pick(ACTIONS);
  const target = trk();
  await client.query(
    'INSERT INTO activity (actor, action, target) VALUES ($1, $2, $3)',
    [actor, action, target],
  );
  console.log(`+ ${actor} · ${action} · ${target}`);
  if (delayMs) await sleep(delayMs);
}
await client.end();
console.log(`done — inserted ${count} rows`);
