import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfig, CONFIG } from '../config';
import {
  ActionCount,
  ActivityRow,
  FeedState,
  FeedUpdate,
} from '../feed/feed.types';

const KEY_RECENT = 'feed:recent';
const KEY_TOTAL = 'feed:count:total';
const KEY_TOP = 'feed:top_actions';
const TOP_N = 6;

@Injectable()
export class RedisStore implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(RedisStore.name);
  private redis!: Redis;

  constructor(@Inject(CONFIG) private readonly cfg: AppConfig) {}

  onModuleInit() {
    const r = this.cfg.redis;
    this.redis = r.url
      ? new Redis(r.url)
      : new Redis({ host: r.host, port: r.port, password: r.password });
    this.redis.on('error', (e) => this.log.error(`redis: ${e.message}`));
  }

  async onModuleDestroy() {
    await this.redis?.quit().catch(() => undefined);
  }

  // Initial load: replace the projection with a fresh snapshot from Postgres.
  async rebuild(state: FeedState): Promise<void> {
    const pipe = this.redis.pipeline();
    pipe.del(KEY_RECENT, KEY_TOTAL, KEY_TOP);
    pipe.set(KEY_TOTAL, state.total);
    for (const a of state.top) pipe.zadd(KEY_TOP, a.count, a.action);
    // feed comes newest-first; RPUSH preserves that order (index 0 = newest).
    for (const row of state.feed) pipe.rpush(KEY_RECENT, JSON.stringify(row));
    pipe.ltrim(KEY_RECENT, 0, this.cfg.feedMax - 1);
    await pipe.exec();
    this.log.log(
      `redis projection rebuilt — total=${state.total}, actions=${state.top.length}`,
    );
  }

  async applyEvent(row: ActivityRow): Promise<FeedUpdate> {
    const [, total] = (await this.redis
      .pipeline()
      .lpush(KEY_RECENT, JSON.stringify(row))
      .incr(KEY_TOTAL)
      .ltrim(KEY_RECENT, 0, this.cfg.feedMax - 1)
      .zincrby(KEY_TOP, 1, row.action)
      .exec()) as [Error | null, unknown][];
    return {
      total: Number((total as [Error | null, string])[1]),
      top: await this.readTop(),
      row,
    };
  }

  async getState(): Promise<FeedState> {
    const [total, recent] = await Promise.all([
      this.redis.get(KEY_TOTAL),
      this.redis.lrange(KEY_RECENT, 0, this.cfg.feedMax - 1),
    ]);
    return {
      total: Number(total ?? 0),
      top: await this.readTop(),
      feed: recent.map((s) => JSON.parse(s) as ActivityRow),
    };
  }

  private async readTop(): Promise<ActionCount[]> {
    const flat = await this.redis.zrevrange(KEY_TOP, 0, TOP_N - 1, 'WITHSCORES');
    const out: ActionCount[] = [];
    for (let i = 0; i < flat.length; i += 2)
      out.push({ action: flat[i], count: Number(flat[i + 1]) });
    return out;
  }
}
