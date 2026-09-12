import "dotenv/config";
import { nanoid } from "nanoid";
import { getDb } from "./client.js";
import { hashPassword } from "../services/authService.js";

/**
 * Seed de demonstração. Roda apenas se NODE_ENV !== 'production',
 * para nunca misturar dados falsos com um banco real de usuários.
 */
async function seed() {
  if (process.env.NODE_ENV === "production") {
    console.error("✗ seed bloqueado em produção");
    process.exit(1);
  }

  const db = getDb();
  const email = "demo@lifeos.app";

  const existing = await db.execute({ sql: "SELECT id FROM users WHERE email = ?", args: [email] });
  if (existing.rows.length > 0) {
    console.log("↷ usuário demo já existe, seed ignorado");
    return;
  }

  const userId = nanoid();
  const passwordHash = await hashPassword("Demo1234");

  await db.execute({
    sql: `INSERT INTO users (id, name, email, password_hash, role, onboarding_done)
          VALUES (?, ?, ?, ?, 'user', 1)`,
    args: [userId, "Usuário Demo", email, passwordHash],
  });
  await db.execute({ sql: "INSERT INTO user_settings (user_id) VALUES (?)", args: [userId] });

  const projectId = nanoid();
  await db.execute({
    sql: `INSERT INTO projects (id, owner_id, name, kind, color) VALUES (?, ?, ?, ?, ?)`,
    args: [projectId, userId, "LifeOS", "professional", "#E8A33D"],
  });

  const demoTasks: Array<[string, string, string]> = [
    ["Revisar artigo", "A Fazer", "Alta"],
    ["Finalizar dashboard", "Em Andamento", "Alta"],
    ["Ler 20 páginas", "Concluído", "Média"],
    ["Configurar Turso", "Concluído", "Alta"],
    ["Ajustar Kanban mobile", "Backlog", "Baixa"],
  ];
  for (const [title, status, priority] of demoTasks) {
    await db.execute({
      sql: `INSERT INTO tasks (id, owner_id, project_id, title, status, priority)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [nanoid(), userId, projectId, title, status, priority],
    });
  }

  const habitNames = ["Água", "Leitura", "Exercício", "Inglês"];
  for (const name of habitNames) {
    await db.execute({
      sql: `INSERT INTO habits (id, owner_id, name, frequency) VALUES (?, ?, ?, 'daily')`,
      args: [nanoid(), userId, name],
    });
  }

  console.log("✓ seed concluído");
  console.log(`  login demo: ${email} / senha: Demo1234`);
}

seed().catch((err) => {
  console.error("✗ falha no seed:", err);
  process.exit(1);
});
