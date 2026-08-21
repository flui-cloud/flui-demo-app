import { Injectable } from '@nestjs/common';
import { defer, finalize, Observable, Subject } from 'rxjs';
import { FeedUpdate } from './feed.types';

@Injectable()
export class FeedEvents {
  private readonly stream = new Subject<FeedUpdate>();
  private subscribers = 0;

  emit(update: FeedUpdate): void {
    this.stream.next(update);
  }

  // Counted at subscribe and teardown rather than read off the Subject, whose
  // `observers` array is deprecated in RxJS 7.
  watch(): Observable<FeedUpdate> {
    return defer(() => {
      this.subscribers += 1;
      return this.stream.pipe(
        finalize(() => {
          this.subscribers -= 1;
        }),
      );
    });
  }

  /** How many browsers are currently subscribed to the feed. */
  get watchers(): number {
    return this.subscribers;
  }
}
