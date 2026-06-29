export interface PgConfig {
  connectionString?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
}

export interface RedisConfig {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
}

export interface GeneratorConfig {
  enabled: boolean;
  minMs: number;
  maxMs: number;
}

export interface AppConfig {
  port: number;
  feedMax: number;
  channel: string;
  subject: string;
  pg: PgConfig;
  redis: RedisConfig;
  natsServers: string;
  generator: GeneratorConfig;
}

export function loadConfig(): AppConfig {
  const env = process.env;
  return {
    port: Number(env.PORT ?? 3000),
    feedMax: Number(env.FEED_MAX ?? 50),
    channel: 'feed',
    subject: 'feed.new',
    pg: env.DATABASE_URL
      ? { connectionString: env.DATABASE_URL }
      : {
          host: env.PGHOST ?? 'localhost',
          port: Number(env.PGPORT ?? 5432),
          user: env.PGUSER ?? 'demo',
          password: env.PGPASSWORD ?? 'demo',
          database: env.PGDATABASE ?? 'demo',
        },
    redis: env.REDIS_URL
      ? { url: env.REDIS_URL }
      : {
          host: env.REDIS_HOST ?? 'localhost',
          port: Number(env.REDIS_PORT ?? 6379),
          password: env.REDIS_PASSWORD,
        },
    natsServers:
      env.NATS_URL ??
      `nats://${env.NATS_HOST ?? 'localhost'}:${env.NATS_PORT ?? 4222}`,
    generator: {
      enabled: (env.GENERATOR_ENABLED ?? 'true') !== 'false',
      minMs: Number(env.GENERATOR_MIN_MS ?? 700),
      maxMs: Number(env.GENERATOR_MAX_MS ?? 1800),
    },
  };
}

export const CONFIG = 'CONFIG';
