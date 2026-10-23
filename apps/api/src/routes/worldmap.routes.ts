import { Router } from "express";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { getWorldMap } from "../services/worldmapService.js";

/** Mapa do Mundo — regiões da vida derivadas do XP real do próprio usuário (somente leitura). */
export const worldmapRouter = Router();
worldmapRouter.use(requireAuth);

worldmapRouter.get("/", async (req, res) => {
  try {
    return res.json(await getWorldMap(getDb(), req.user!.id));
  } catch (err) {
    console.error("[mapa] erro:", err instanceof Error ? err.message : "desconhecido");
    return res.status(500).json({ error: "Não foi possível carregar o Mapa do Mundo." });
  }
});
