import "server-only";

import postgres from "postgres";

type DatabaseClient = ReturnType<typeof postgres>;

declare global {
  var __korumDatabaseClient: DatabaseClient | undefined;
}

function createDatabaseClient() {
  const databaseUrl = process.env.DATABASE_URL;
  const tunnelHost = process.env.KORUM_DB_TUNNEL_HOST;
  if (!databaseUrl && !tunnelHost) {
    throw new Error("DATABASE_URL is required for database-backed routes.");
  }

  const options = {
    max: 5,
    connect_timeout: 10,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    prepare: false,
  };

  if (tunnelHost) {
    return postgres({
      ...options,
      host: tunnelHost,
      port: Number(process.env.KORUM_DB_TUNNEL_PORT || 15432),
      database: process.env.PGDATABASE,
      username: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      ssl: "require",
    });
  }

  return postgres(databaseUrl!, options);
}

export function getDatabase() {
  if (!globalThis.__korumDatabaseClient) {
    globalThis.__korumDatabaseClient = createDatabaseClient();
  }
  return globalThis.__korumDatabaseClient;
}
