import { readdirSync, readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getDb } from "./client.js";

/**
 * Executa todas as migrations em apps/api/src/db/migrations, em ordem
 * alfabética (por isso o prefixo numérico 0001_, 0002_...). Cada
 * migration só roda uma vez: o nome do arquivo é registrado em
 * schema_migrations depois de aplicado com sucesso. Idempotente e
 * seguro para chamar mais de uma vez (inclusive automaticamente a
 * cada cold start da function na Vercel — ver o middleware em
 * app.ts): migrations já aplicadas são só puladas.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

export async function runMigrations(): Promise<void> {
  // Só faz sentido criar apps/api/data quando o banco é um arquivo
  // SQLite local (dev sem Turso). Em produção (Vercel) o filesystem é
  // somente leitura fora de /tmp e DATABASE_URL aponta pro Turso
  // remoto — tentar mkdir aí quebraria a inicialização à toa.
  const dbUrl = process.env.DATABASE_URL ?? "file:./data/lifeos.db";
  if (dbUrl.startsWith("file:")) {
    try {
      mkdirSync(path.join(process.cwd(), "data"), { recursive: true });
    } catch {
      // Ambiente com filesystem restrito: segue sem a pasta local, o
      // client do libSQL que acuse o erro real se precisar dela.
    }
  }

  const db = getDb();

  await db.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = await db.execute("SELECT name FROM schema_migrations");
  const appliedNames = new Set(applied.rows.map((r) => r.name as string));

  let files: string[];
  try {
    files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch (err) {
    // Em produção (function serverless), os .sql só ficam disponíveis
    // se o bundler incluir a pasta explicitamente (ver "includeFiles"
    // no vercel.json). Se isso não aconteceu, não faz sentido travar
    // a aplicação inteira por causa disso — loga um aviso claro e
    // segue sem aplicar nada agora.
    console.error(`✗ pasta de migrations não encontrada em ${MIGRATIONS_DIR} — pulando aplicação automática.`, err);
    return;
  }

  for (const file of files) {
    if (appliedNames.has(file)) {
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

    console.log(`→ aplicando migration: ${file}`);
    for (const statement of statements) {
      await db.execute(statement);
    }

    await db.execute({
      sql: "INSERT INTO schema_migrations (name) VALUES (?)",
      args: [file],
    });
  }
}

// Só roda como script de linha de comando (`npm run migrate`) quando
// este arquivo é o entrypoint direto — importar `runMigrations` de
// outro módulo (ex.: app.ts) nunca dispara isto nem chama
// process.exit, que derrubaria a function serverless.
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  runMigrations()
    .then(() => {
      console.log("✓ migrations concluídas");
      process.exit(0);
    })
    .catch((err) => {
      console.error("✗ falha ao rodar migrations:", err);
      process.exit(1);
    });
}
