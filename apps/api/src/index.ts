import { app } from "./app.js";

/**
 * Entrypoint tradicional (dev local com `npm run dev`, ou qualquer
 * host long-running como Railway/Render/VM). Na Vercel, quem sobe é
 * api/index.ts (função serverless) — este arquivo nunca roda lá.
 */
const port = Number(process.env.PORT ?? 3333);
app.listen(port, () => {
  console.log(`✓ LifeOS API rodando em http://localhost:${port}`);
});
