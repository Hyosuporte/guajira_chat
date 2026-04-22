import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, QueryResult } from 'pg';

export interface ClientConfig {
  name: string;
  host: string;
  port: number;
  database: string;
  user: string;
  pass: string;
  schema?: string;
}

export const CLIENTS: Record<string, ClientConfig> = {
  CARDIQUE: {
    name: 'CARDIQUE',
    host: '65.21.181.225',
    port: 5432,
    database: 'CARDIQUE2024_SIAN',
    user: 'CARDIQUESIAN',
    pass: 'C4rd1qu3S14n',
    schema: 'public',
  },
  CVSCORDOBA: {
    name: 'CVS CORDOBA',
    host: '65.21.181.225',
    port: 5432,
    database: 'CVSCORDOBA2022_SIAN',
    user: 'CVSCORDOBA',
    pass: 'CvSC0rd0baS14n',
    schema: 'public',
  },
  GUAJIRA: {
    name: 'GUAJIRA',
    host: '65.21.181.225',
    port: 5432,
    database: 'GUAJIRA2022_SIAN',
    user: 'SIANGUAJIRA',
    pass: 'S14nGu4j1r4',
    schema: 'public',
  },
  SOACHA: {
    name: 'SOACHA',
    host: '65.21.181.225',
    port: 5432,
    database: 'SOACHA2023_SIAN',
    user: 'SIANSOACHA',
    pass: 'S04ch42023',
    schema: 'public',
  },
  CORPOCESAR: {
    name: 'CORPOCESAR',
    host: '65.21.181.225',
    port: 5432,
    database: 'CORPOCESAR2024_SIAN',
    user: 'SIANCORPOCESAR',
    pass: 'S14nC0rp0c3s4r',
    schema: 'public',
  },
  CODECHOCO: {
    name: 'CODECHOCO',
    host: '65.21.181.225',
    port: 5432,
    database: 'CODECHOCO2025_SIAN',
    user: 'SIANCODECHOCO',
    pass: 'S14nC0d3ch0c0',
    schema: 'public',
  },
};

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pools: Map<string, Pool> = new Map();
  private defaultPool: Pool;

  onModuleInit() {
    this.defaultPool = new Pool({
      host: process.env.DB_HOST,
      port: 5432,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      idleTimeoutMillis: 30000,
      min: 1,
      max: 10,
    });
  }

  getPool(clientKey?: string): Pool {
    if (!clientKey || !CLIENTS[clientKey]) {
      return this.defaultPool;
    }

    if (!this.pools.has(clientKey)) {
      const config = CLIENTS[clientKey];
      const pool = new Pool({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.pass,
        database: config.database,
        idleTimeoutMillis: 30000,
        min: 1,
        max: 5,
      });
      this.pools.set(clientKey, pool);
    }

    return this.pools.get(clientKey)!;
  }

  async query(
    text: string,
    params?: any[],
    clientKey?: string,
  ): Promise<QueryResult> {
    const pool = this.getPool(clientKey);
    return pool.query(text, params);
  }

  async onModuleDestroy() {
    await this.defaultPool.end();
    for (const pool of this.pools.values()) {
      await pool.end();
    }
  }
}
