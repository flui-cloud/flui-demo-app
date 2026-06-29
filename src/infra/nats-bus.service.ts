import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { connect, NatsConnection, StringCodec } from 'nats';
import { AppConfig, CONFIG } from '../config';

@Injectable()
export class NatsBus implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(NatsBus.name);
  private readonly codec = StringCodec();
  private nc!: NatsConnection;

  constructor(@Inject(CONFIG) private readonly cfg: AppConfig) {}

  async onModuleInit() {
    this.nc = await connect({ servers: this.cfg.natsServers });
    this.log.log(`connected to NATS at ${this.cfg.natsServers}`);
  }

  async onModuleDestroy() {
    await this.nc?.drain().catch(() => undefined);
  }

  publish<T>(subject: string, payload: T): void {
    this.nc.publish(subject, this.codec.encode(JSON.stringify(payload)));
  }

  subscribe<T>(subject: string, handler: (payload: T) => void): void {
    const sub = this.nc.subscribe(subject);
    void (async () => {
      for await (const msg of sub) {
        try {
          handler(JSON.parse(this.codec.decode(msg.data)) as T);
        } catch (e) {
          this.log.error(`bad message on ${subject}: ${(e as Error).message}`);
        }
      }
    })();
    this.log.log(`subscribed to ${subject}`);
  }
}
