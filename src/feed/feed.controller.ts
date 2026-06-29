import { Controller, MessageEvent, Sse } from '@nestjs/common';
import { concat, from, map, Observable } from 'rxjs';
import { RedisStore } from '../infra/redis-store.service';
import { FeedEvents } from './feed-events';

@Controller()
export class FeedController {
  constructor(
    private readonly redis: RedisStore,
    private readonly events: FeedEvents,
  ) {}

  // First frame is the full state from Redis (initial load), then live updates.
  @Sse('sse')
  sse(): Observable<MessageEvent> {
    const init$ = from(this.redis.getState()).pipe(
      map((state) => ({ type: 'init', data: state }) as MessageEvent),
    );
    const updates$ = this.events.stream.pipe(
      map((update) => ({ type: 'update', data: update }) as MessageEvent),
    );
    return concat(init$, updates$);
  }
}
