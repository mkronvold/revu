import { Pool, type PoolClient } from "pg";

import { config } from "./config.js";

let pool: Pool | null = null;
let closingPool: Promise<void> | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on("error", (err) => {
      console.error("Unexpected error on idle database client", err);
    });
  }

  return pool;
}

export async function closePool(): Promise<void> {
  if (closingPool) {
    await closingPool;
    return;
  }

  if (!pool) {
    return;
  }

  const currentPool = pool;
  closingPool = currentPool.end().finally(() => {
    if (pool === currentPool) {
      pool = null;
    }
    closingPool = null;
  });

  await closingPool;
}

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
