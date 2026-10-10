import { fileURLToPath } from "node:url";
import express from "express";
import { exigirAuth } from "./auth.js";
import { carregarConfig } from "./config.js";
import { abrirBanco } from "./db.js";
import { rotaInexistente, tratadorErros } from "./erros.js";
import { limitador } from "./limite.js";
import { openapi } from "./openapi.js";
import { rotasAuth } from "./rotas/auth.js";
import { rotasCategorias } from "./rotas/categorias.js";
import { rotasMovimentacoes } from "./rotas/movimentacoes.js";
import { rotasPainel } from "./rotas/painel.js";
import { rotasProdutos } from "./rotas/produtos.js";

const PUBLIC = fileURLToPath(new URL("../public", import.meta.url));

/** Cabeçalhos de segurança básicos; o console só carrega recursos do próprio servidor. */
function cabecalhosSeguranca(req, res, next) {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy":
      "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  });
  next();
}

/**
 * Monta o app Express. Nos testes, passe `{ config, db }` para isolar o banco (em memória por padrão).
 */
export function criarApp({ config: sobrescritas = {}, db: bancoPronto } = {}) {
  const config = { ...carregarConfig(), arquivoDb: ":memory:", ...sobrescritas };
  const db = bancoPronto ?? abrirBanco(config.arquivoDb);
  const autenticar = exigirAuth(db, config);
  const limitarTentativas = limitador(config.limiteAuth);

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.confiarProxy ?? false);
  app.use(cabecalhosSeguranca);
  app.use(express.json({ limit: "100kb" }));

  const api = express.Router();
  api.get("/saude", (req, res) => res.json({ status: "ok", versao: openapi.info.version, ambiente: config.ambiente }));
  api.get("/openapi.json", (req, res) => res.json(openapi));
  api.use("/auth", rotasAuth({ db, config, autenticar, limitarTentativas }));
  // Tudo abaixo exige token.
  api.use("/produtos", autenticar, rotasProdutos({ db }));
  api.use("/categorias", autenticar, rotasCategorias({ db }));
  api.use("/movimentacoes", autenticar, rotasMovimentacoes({ db }));
  api.use("/painel", autenticar, rotasPainel({ db }));
  api.use(rotaInexistente);
  app.use("/api/v1", api);

  // Console (início, documentação com playground e painel): arquivos estáticos em /public.
  app.use(express.static(PUBLIC, { extensions: ["html"], maxAge: config.ambiente === "production" ? "1h" : 0 }));
  app.use(rotaInexistente);
  app.use(tratadorErros());

  app.locals.db = db;
  app.locals.config = config;
  return app;
}
