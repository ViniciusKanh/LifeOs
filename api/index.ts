import { app } from "../apps/api/src/app.js";

/**
 * Função serverless da Vercel para o deploy em projeto único (raiz do
 * repositório). A Vercel só reconhece funções dentro de /api na raiz
 * do projeto — por isso este arquivo-ponte existe aqui em vez de só
 * em apps/api/api/index.ts (usado no deploy alternativo com dois
 * projetos, ver DEPLOY.md). Nenhuma rota é duplicada: os dois só
 * reexportam o mesmo app Express de apps/api/src/app.ts.
 */
export default app;
