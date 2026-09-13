import { app } from "../src/app.js";

/**
 * Função serverless da Vercel. Qualquer arquivo dentro de /api vira
 * uma function; aqui reaproveitamos o mesmo app Express (sem
 * app.listen) usado em dev — nenhuma rota é duplicada. O vercel.json
 * ao lado reescreve toda requisição para esta function.
 */
export default app;
