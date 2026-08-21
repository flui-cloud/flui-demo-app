import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

/**
 * One line per request, written when the response ends.
 *
 * Middleware rather than an interceptor because of `/sse`: an interceptor sees
 * that connection only once it closes, so the line would land minutes late and
 * out of order.
 */
@Injectable()
export class RequestLogMiddleware implements NestMiddleware {
  private readonly log = new Logger('Request');

  use(req: Request, res: Response, next: NextFunction): void {
    const startedAt = Date.now();
    let written = false;

    const write = (how: string) => {
      if (written) return;
      written = true;
      const ms = Date.now() - startedAt;
      const line = `${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms${how}`;
      if (res.statusCode >= 500) this.log.error(line);
      else if (res.statusCode >= 400) this.log.warn(line);
      else this.log.log(line);
    };

    res.on('finish', () => write(''));
    // `finish` never fires for a stream the client abandons, which is every
    // visit to /sse: the tab closes and the response is dropped, not ended.
    res.on('close', () => write(' (client went away)'));
    next();
  }
}
