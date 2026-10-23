// Fuso fixo de São Paulo (UTC-3) em todos os testes, em qualquer SO — inclusive
// Windows, onde "TZ=... npm test" não funciona. O Node aplica a mudança na hora.
// (Acesso via globalThis: o tsconfig do front não carrega os tipos do Node.)
(globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env.TZ = "America/Sao_Paulo";
