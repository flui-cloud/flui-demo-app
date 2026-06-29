import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Client, Pool } from 'pg';
import { AppConfig, CONFIG } from '../config';

@Injectable()
export class PgService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PgService.name);
  private pool!: Pool;
  private listener?: Client;

  constructor(@Inject(CONFIG) private readonly cfg: AppConfig) {}

  onModuleInit() {
    this.pool = new Pool(this.cfg.pg);
    this.pool.on('error', (e) => this.log.error(`pg pool: ${e.message}`));
  }

  async onModuleDestroy() {
    await this.listener?.end().catch(() => undefined);
    await this.pool?.end().catch(() => undefined);
  }

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    const res = await this.pool.query<T & Record<string, unknown>>(sql, params);
    return res.rows;
  }

  // Multi-statement scripts (schema / seed) via the simple query protocol.
  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  // Dedicated connection: pg delivers NOTIFY on the connection that issued LISTEN.
  async startRelay(
    channel: string,
    onPayload: (payload: string) => void,
  ): Promise<void> {
    this.listener = new Client(this.cfg.pg);
    await this.listener.connect();
    this.listener.on('notification', (msg) => {
      if (msg.payload) onPayload(msg.payload);
    });
    await this.listener.query(`LISTEN ${channel}`);
    this.log.log(`LISTEN ${channel} (pg relay active)`);
  }
}
