import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { AppConfig, CONFIG } from '../config';
import { FeedEvents } from '../feed/feed-events';
import { ActionCount, ActivityRow, FeedState } from '../feed/feed.types';
import { GeneratorService } from './generator.service';
import { NatsBus } from './nats-bus.service';
import { PgService } from './pg.service';
import { RedisStore } from './redis-store.service';

const SQL_DIR = join(process.cwd(), 'sql');

@Injectable()
export class BootstrapService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly log = new Logger(BootstrapService.name);
  private relayed = 0;
  private heartbeat?: NodeJS.Timeout;

  constructor(
    @Inject(CONFIG) private readonly cfg: AppConfig,
    private readonly pg: PgService,
    private readonly redis: RedisStore,
    private readonly nats: NatsBus,
    private readonly events: FeedEvents,
    private readonly generator: GeneratorService,
  ) {}

  async onApplicationBootstrap() {
    await this.ensureSchema();
    await this.rebuildProjection();
    this.startConsumer();
    await this.startRelay();
    this.startHeartbeat();
    this.log.log('demo chain is live: pg LISTEN -> NATS -> Redis -> SSE');
    if (this.cfg.generator.enabled) this.generator.start();
  }

  private async sql(file: string): Promise<string> {
    return readFile(join(SQL_DIR, file), 'utf8');
  }

  private async ensureSchema() {
    const [{ present }] = await this.pg.query<{ present: string | null }>(
      `SELECT to_regclass('public.shipments') AS present`,
    );
    if (!present) {
      this.log.log('loading logistics schema + seed...');
      await this.pg.exec(await this.sql('logistics.schema.sql'));
      await this.pg.exec(await this.sql('logistics.seed.sql'));
    }

    await this.pg.exec(await this.sql('activity.sql'));

    const [{ count }] = await this.pg.query<{ count: string }>(
      `SELECT count(*)::int AS count FROM activity`,
    );
    if (Number(count) === 0) {
      this.log.log('deriving activity feed from tracking_events...');
      await this.pg.exec(await this.sql('activity.seed.sql'));
    }
  }

  private async readState(): Promise<FeedState> {
    const [[{ total }], top, rows] = await Promise.all([
      this.pg.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM activity`,
      ),
      this.pg.query<ActionCount>(
        `SELECT action, count(*)::int AS count
           FROM activity GROUP BY action ORDER BY count DESC`,
      ),
      this.pg.query<ActivityRow>(
        `SELECT id, actor, action, target, created_at
           FROM activity ORDER BY created_at DESC, id DESC LIMIT $1`,
        [this.cfg.feedMax],
      ),
    ]);
    return { total, top, feed: rows.map(normalize) };
  }

  private async rebuildProjection() {
    await this.redis.rebuild(await this.readState());
  }

  // Logged at the end of the chain: a line here means the row was written,
  // Postgres notified, NATS delivered, Redis updated and the browsers pushed
  // to. Logging any earlier would only prove something was attempted.
  private startConsumer() {
    this.nats.subscribe<ActivityRow>(this.cfg.subject, (row) => {
      const startedAt = Date.now();
      void this.redis
        .applyEvent(normalize(row))
        .then((update) => {
          this.events.emit(update);
          this.relayed += 1;
          const watchers = this.events.watchers;
          this.log.log(
            `#${row.id} ${row.actor} ${row.action} ${row.target} ` +
              `— relayed in ${Date.now() - startedAt}ms to ${watchers} watching`,
          );
        })
        .catch((e) => this.log.error(`consumer: ${(e as Error).message}`));
    });
  }

  // One line a minute regardless of traffic, so liveness can be checked by
  // grep without reading through every per-event line.
  private startHeartbeat() {
    this.heartbeat = setInterval(() => {
      const relayed = this.relayed;
      this.relayed = 0;
      this.log.log(
        `last minute: ${relayed} events through the chain, ${this.events.watchers} watching`,
      );
    }, 60_000);
    this.heartbeat.unref?.();
  }

  onApplicationShutdown() {
    if (this.heartbeat) clearInterval(this.heartbeat);
  }

  private async startRelay() {
    await this.pg.startRelay(this.cfg.channel, (payload) => {
      this.nats.publish(this.cfg.subject, JSON.parse(payload) as ActivityRow);
    });
  }
}

function normalize(row: ActivityRow): ActivityRow {
  return {
    id: Number(row.id),
    actor: row.actor,
    action: row.action,
    target: row.target,
    created_at: new Date(row.created_at).toISOString(),
  };
}
