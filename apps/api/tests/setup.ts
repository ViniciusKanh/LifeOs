import { existsSync, mkdirSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { beforeAll, afterAll } from "vitest";

/**
 * Banco de teste: um arquivo SQLite novo por execução da suite,
 * migrado do zero (mesmas migrations de produção) e apagado no final.
 * Nunca toca no banco real de dev/produção — DATABASE_URL é definida
 * aqui, antes de qualquer teste importar `app` (que só cria a conexão
 * na primeira chamada a getDb(), então isso é seguro).
 */
const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, `test-${process.pid}-${Date.now()}.db`);

process.env.DATABASE_URL = `file:${dbPath}`;
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret-only-for-automated-tests";
process.env.CREDENTIALS_ENCRYPTION_KEY = process.env.CREDENTIALS_ENCRYPTION_KEY ?? "0123456789abcdef0123456789abcdef";
process.env.NODE_ENV = "test";
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@teste.lifeos";

beforeAll(() => {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  execSync("npx tsx src/db/migrate.ts", { cwd: process.cwd(), env: process.env, stdio: "pipe" });
});

afterAll(() => {
  rmSync(dbPath, { force: true });
});
