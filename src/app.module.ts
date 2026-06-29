import { Module } from '@nestjs/common';
import { CONFIG, loadConfig } from './config';
import { FeedController } from './feed/feed.controller';
import { FeedEvents } from './feed/feed-events';
import { BootstrapService } from './infra/bootstrap.service';
import { GeneratorController } from './infra/generator.controller';
import { GeneratorService } from './infra/generator.service';
import { NatsBus } from './infra/nats-bus.service';
import { PgService } from './infra/pg.service';
import { RedisStore } from './infra/redis-store.service';
import { HealthController } from './health/health.controller';

@Module({
  controllers: [FeedController, HealthController, GeneratorController],
  providers: [
    { provide: CONFIG, useFactory: loadConfig },
    PgService,
    RedisStore,
    NatsBus,
    FeedEvents,
    GeneratorService,
    BootstrapService,
  ],
})
export class AppModule {}
