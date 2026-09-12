import { readdirSync, readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getDb } from "./client.js";

/**
 * Executa todas as migrations em apps/api/src/db/migrations, em ordem
 * alfabética (por isso o prefixo numérico 0001_, 0002_...). Cada
 * migration só roda uma vez: o nome do arquivo é registrado em
 * schema_migrations depois de aplicado com sucesso.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

async function run() {
  // garante que a pasta de dados exista quando usando SQLite local em arquivo
  mkdirSync(path.join(process.cwd(), "data"), { recursive: true });

  const db = getDb();

  await db.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = await db.execute("SELECT name FROM schema_migrations");
  const appliedNames = new Set(applied.rows.map((r) => r.name as string));

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (appliedNames.has(file)) {
      console.log(`↷ já aplicada: ${file}`);
      continue;
    }

    const rawSql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
    // Remove linhas de comentário inteiras antes de dividir por ";",
    // para não sobrar um "statement" composto só de comentário.
    const sqlWithoutComments = rawSql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");

    const statements = sqlWithoutComments
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    console.log(`→ aplicando: ${file}`);
    for (const statement of statements) {
      await db.execute(statement);
    }

    await db.execute({
      sql: "INSERT INTO schema_migrations (name) VALUES (?)",
      args: [file],
    });
  }

  console.log("✓ migrations concluídas");
}

run().catch((err) => {
  console.error("✗ falha ao rodar migrations:", err);
  process.exit(1);
});
