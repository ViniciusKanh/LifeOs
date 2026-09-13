import { nanoid } from "nanoid";
import request from "supertest";
import { app } from "../src/app.js";
import { getDb } from "../src/db/client.js";
import { hashPassword } from "../src/services/authService.js";

/**
 * Cria um usuário já com e-mail verificado direto no banco (pulando o
 * fluxo de confirmação por e-mail, que é testado à parte) e devolve um
 * agente supertest já autenticado (cookie de sessão) pronto pra bater
 * em qualquer rota protegida.
 */
export async function createAuthenticatedAgent(overrides?: { email?: string; password?: string; name?: string }) {
  const db = getDb();
  // O login (loginSchema) normaliza o e-mail para minúsculas antes de
  // consultar o banco — nanoid pode gerar letras maiúsculas, então
  // normalizamos aqui também para o e-mail inserido bater com a busca.
  const email = (overrides?.email ?? `${nanoid(8)}@teste.lifeos`).toLowerCase();
  const password = overrides?.password ?? "SenhaForte123!";
  const name = overrides?.name ?? "Usuário de Teste";
  const id = nanoid();

  const passwordHash = await hashPassword(password);
  await db.execute({
    sql: `INSERT INTO users (id, name, email, password_hash, role, email_verified) VALUES (?, ?, ?, ?, 'user', 1)`,
    args: [id, name, email, passwordHash],
  });
  await db.execute({ sql: "INSERT INTO user_settings (user_id) VALUES (?)", args: [id] });

  const agent = request.agent(app);
  const loginRes = await agent.post("/api/auth/login").send({ email, password, rememberMe: false });
  if (loginRes.status !== 200) {
    throw new Error(`Falha ao autenticar usuário de teste: ${loginRes.status} ${JSON.stringify(loginRes.body)}`);
  }

  return { agent, userId: id, email };
}
