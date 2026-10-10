/** Configuração lida das variáveis de ambiente (ver .env.example). */
export function carregarConfig(env = process.env) {
  const producao = env.NODE_ENV === "production";
  let jwtSecret = env.JWT_SECRET;

  if (!jwtSecret) {
    if (producao) throw new Error("Defina JWT_SECRET em produção (use um valor longo e aleatório).");
    jwtSecret = "segredo-de-desenvolvimento-troque-em-producao";
  }

  return {
    ambiente: producao ? "production" : "development",
    porta: Number(env.PORT ?? 3000),
    arquivoDb: env.DB_FILE ?? "estoque.db",
    jwtSecret,
    jwtExpiraSegundos: Number(env.JWT_EXPIRA_SEGUNDOS ?? 7200),
    // Limite de tentativas nas rotas de autenticação (por IP, por janela).
    limiteAuth: { max: Number(env.LIMITE_AUTH_MAX ?? 10), janelaMs: Number(env.LIMITE_AUTH_JANELA_MS ?? 60_000) },
    segredoPadrao: !env.JWT_SECRET,
  };
}
