import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { AppConfig, CONFIG } from '../config';
import { PgService } from './pg.service';

const CARRIERS = [
  'DHL Express', 'BRT', 'GLS', 'TNT', 'Poste Italiane', 'SDA', 'UPS', 'FedEx',
];
const ACTIONS = [
  'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned',
];
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const trk = () => 'TRK-' + Math.floor(10000 + Math.random() * 89999);

// Ambient traffic so the page is never static: inserts a real activity row
// every ~min..max ms, through the same chain as any other INSERT. Pause it
// (POST /generator/stop) to isolate a single change.
@Injectable()
export class GeneratorService implements OnModuleDestroy {
  private readonly log = new Logger(GeneratorService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @Inject(CONFIG) private readonly cfg: AppConfig,
    private readonly pg: PgService,
  ) {}

  isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.log.log(
      `ambient generator started (${this.cfg.generator.minMs}-${this.cfg.generator.maxMs}ms)`,
    );
    this.schedule();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    clearTimeout(this.timer);
    this.log.log('ambient generator stopped');
  }

  onModuleDestroy() {
    this.stop();
  }

  private schedule(): void {
    if (!this.running) return;
    const { minMs, maxMs } = this.cfg.generator;
    const delay = minMs + Math.random() * Math.max(0, maxMs - minMs);
    this.timer = setTimeout(() => {
      void this.insertOne()
        .catch((e) => this.log.error(`generator: ${(e as Error).message}`))
        .finally(() => this.schedule());
    }, delay);
  }

  private async insertOne(): Promise<void> {
    await this.pg.query(
      'INSERT INTO activity (actor, action, target) VALUES ($1, $2, $3)',
      [pick(CARRIERS), pick(ACTIONS), trk()],
    );
  }
}
