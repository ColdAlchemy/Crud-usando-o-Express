import { criarApp } from "./app.js";
import { carregarConfig } from "./config.js";

const config = carregarConfig();
if (config.segredoPadrao) console.warn("Aviso: JWT_SECRET não definido; usando um segredo de desenvolvimento. Defina JWT_SECRET em produção.");

const servidor = criarApp({ config }).listen(config.porta, () => {
  console.log(`Estoque API em http://localhost:${config.porta}  (console em /, docs em /#/docs, banco: ${config.arquivoDb})`);
});

// Encerra com calma (Docker envia SIGTERM): termina as requisições em andamento antes de sair.
for (const sinal of ["SIGINT", "SIGTERM"]) {
  process.on(sinal, () => servidor.close(() => process.exit(0)));
}
