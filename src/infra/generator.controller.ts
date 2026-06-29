import { Controller, Get, Post } from '@nestjs/common';
import { GeneratorService } from './generator.service';

// Toggle the ambient traffic at runtime.
@Controller('generator')
export class GeneratorController {
  constructor(private readonly generator: GeneratorService) {}

  @Get()
  status() {
    return { running: this.generator.isRunning() };
  }

  @Post('start')
  start() {
    this.generator.start();
    return { running: true };
  }

  @Post('stop')
  stop() {
    this.generator.stop();
    return { running: false };
  }
}
