import pg from "pg";

/** Admin pool (table owner): seeds rows and reads back without row security. */
export function adminPool(): pg.Pool {
  return new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 6 });
}

export async function createUser(pool: pg.Pool, label: string): Promise<string> {
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const { rows } = await pool.query("INSERT INTO wireline_users (email) VALUES ($1) RETURNING id", [
    email,
  ]);
  return rows[0].id as string;
}

/** Run as production does: SET LOCAL ROLE wireline_server plus the tenant GUC. */
export async function asTenant<T>(
  pool: pg.Pool,
  userId: string,
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE wireline_server");
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
