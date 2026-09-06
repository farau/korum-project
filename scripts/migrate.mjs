import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
const tunnelHost = process.env.KORUM_DB_TUNNEL_HOST;

if (!databaseUrl && !tunnelHost) {
  throw new Error("DATABASE_URL or DATABASE_PUBLIC_URL is required to run migrations.");
}

const migrationsDirectory = path.join(process.cwd(), "db", "migrations");
const connectionOptions = {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  prepare: false,
};

const sql = tunnelHost
  ? postgres({
      ...connectionOptions,
      host: tunnelHost,
      port: Number(process.env.KORUM_DB_TUNNEL_PORT || 15432),
      database: process.env.PGDATABASE,
      username: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      ssl: "require",
    })
  : postgres(databaseUrl, connectionOptions);

const connection = await sql.reserve();

try {
  await connection`SELECT pg_advisory_lock(hashtext('korum_schema_migrations'))`;
  await connection`
    CREATE TABLE IF NOT EXISTS korum_schema_migrations (
      name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  const migrationNames = (await readdir(migrationsDirectory))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const name of migrationNames) {
    const migration = await readFile(path.join(migrationsDirectory, name), "utf8");
    const checksum = createHash("sha256").update(migration).digest("hex");
    const [applied] = await connection`
      SELECT checksum
      FROM korum_schema_migrations
      WHERE name = ${name}
    `;

    if (applied) {
      if (applied.checksum !== checksum) {
        throw new Error(`Applied migration ${name} has been modified.`);
      }
      process.stdout.write(`Already applied: ${name}\n`);
      continue;
    }

    await connection.unsafe("BEGIN");
    try {
      await connection.unsafe(migration);
      await connection`
        INSERT INTO korum_schema_migrations (name, checksum)
        VALUES (${name}, ${checksum})
      `;
      await connection.unsafe("COMMIT");
    } catch (error) {
      await connection.unsafe("ROLLBACK");
      throw error;
    }
    process.stdout.write(`Applied: ${name}\n`);
  }
} finally {
  await connection`SELECT pg_advisory_unlock(hashtext('korum_schema_migrations'))`.catch(() => undefined);
  connection.release();
  await sql.end({ timeout: 5 });
}
