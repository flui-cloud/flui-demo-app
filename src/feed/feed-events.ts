import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';
import { FeedUpdate } from './feed.types';

@Injectable()
export class FeedEvents {
  readonly stream = new Subject<FeedUpdate>();

  emit(update: FeedUpdate): void {
    this.stream.next(update);
  }
}
