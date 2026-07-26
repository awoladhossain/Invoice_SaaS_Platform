import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @HealthCheck()
  @SkipThrottle()
  @ApiOperation({
    summary: 'Check system health, database connection & memory usage',
  })
  check() {
    return this.health.check([
      // 1. Database Ping Check
      () => this.prismaHealth.pingCheck('database', this.prisma),
      // 2. Memory Heap Check (Limit: 300MB)
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),
      // 3. Resident Set Size (RSS) Memory Check (Limit: 500MB)
      () => this.memory.checkRSS('memory_rss', 500 * 1024 * 1024),
    ]);
  }
}
