import { Router, type Response } from "express";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import {
  ContractError,
  addContractTasks,
  createContract,
  deleteContract,
  getContract,
  linkTask,
  listContractTasks,
  listContracts,
  proposeContract,
  proposeContractTasks,
  updateContract,
} from "../services/contractsService.js";
import {
  addTasksSchema,
  createContractSchema,
  linkTaskSchema,
  proposeContractSchema,
  proposeTasksSchema,
  updateContractSchema,
} from "../validators/contracts.schema.js";

/**
 * Gestão de Contratos. Toda query é isolada por owner_id no serviço.
 * As rotas de IA só devolvem propostas: criar/alterar exige uma chamada
 * explícita do usuário (confirmação na interface).
 */
export const contractsRouter = Router();
contractsRouter.use(requireAuth);

const aiLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 20 });

function handleError(res: Response, err: unknown) {
  if (err instanceof ContractError) return res.status(err.status).json({ error: err.message });
  console.error("[contratos] erro:", err instanceof Error ? err.message : "desconhecido");
  return res.status(500).json({ error: "Não foi possível concluir a ação." });
}

contractsRouter.get("/", async (req, res) => {
  try {
    return res.json(await listContracts(getDb(), req.user!.id));
  } catch (err) {
    return handleError(res, err);
  }
});

/** POST /api/contracts/ai/propose — o Gemini monta um contrato (não salva). */
contractsRouter.post("/ai/propose", aiLimit, async (req, res) => {
  const parsed = proposeContractSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  try {
    const result = await proposeContract(getDb(), req.user!.id, parsed.data);
    if (!result.ok) return res.status(422).json({ error: result.message });
    return res.json({ proposal: result.data });
  } catch (err) {
    return handleError(res, err);
  }
});

contractsRouter.post("/", async (req, res) => {
  const parsed = createContractSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  try {
    return res.status(201).json(await createContract(getDb(), req.user!.id, parsed.data));
  } catch (err) {
    return handleError(res, err);
  }
});

contractsRouter.get("/:id", async (req, res) => {
  try {
    const db = getDb();
    const [contract, tasks] = await Promise.all([getContract(db, req.user!.id, req.params.id), listContractTasks(db, req.user!.id, req.params.id)]);
    return res.json({ contract, tasks });
  } catch (err) {
    return handleError(res, err);
  }
});

contractsRouter.patch("/:id", async (req, res) => {
  const parsed = updateContractSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  try {
    return res.json(await updateContract(getDb(), req.user!.id, req.params.id, parsed.data));
  } catch (err) {
    return handleError(res, err);
  }
});

/** DELETE /api/contracts/:id?tasks=open — opcionalmente apaga também as tarefas abertas. */
contractsRouter.delete("/:id", async (req, res) => {
  try {
    await deleteContract(getDb(), req.user!.id, req.params.id, req.query.tasks === "open");
    return res.status(204).send();
  } catch (err) {
    return handleError(res, err);
  }
});

contractsRouter.post("/:id/tasks", async (req, res) => {
  const parsed = addTasksSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  try {
    return res.status(201).json(await addContractTasks(getDb(), req.user!.id, req.params.id, parsed.data.tasks));
  } catch (err) {
    return handleError(res, err);
  }
});

/** POST /api/contracts/:id/link — vincula/desvincula uma tarefa existente. */
contractsRouter.post("/:id/link", async (req, res) => {
  const parsed = linkTaskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados inválidos." });
  try {
    await linkTask(getDb(), req.user!.id, parsed.data.linked ? req.params.id : null, parsed.data.taskId);
    return res.status(204).send();
  } catch (err) {
    return handleError(res, err);
  }
});

/** POST /api/contracts/:id/ai/tasks — o Gemini sugere próximas tarefas (não salva). */
contractsRouter.post("/:id/ai/tasks", aiLimit, async (req, res) => {
  const parsed = proposeTasksSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Dados inválidos." });
  try {
    const result = await proposeContractTasks(getDb(), req.user!.id, req.params.id, parsed.data.hint);
    if (!result.ok) return res.status(422).json({ error: result.message });
    return res.json({ tasks: result.data });
  } catch (err) {
    return handleError(res, err);
  }
});
