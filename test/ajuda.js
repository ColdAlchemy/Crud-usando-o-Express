import { criarApp } from "../src/app.js";

/**
 * Sobe a API numa porta livre com banco em memória e devolve um cliente de teste.
 * Por padrão o limite de tentativas de login é alto (para não atrapalhar); testes de limite passam o seu.
 */
export async function subir({ config = {}, db } = {}) {
  const app = criarApp({ db, config: { limiteAuth: { max: 10_000, janelaMs: 60_000 }, ...config } });
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://localhost:${server.address().port}`;

  const api = {
    app,
    db: app.locals.db,
    base,
    token: null,
    async req(metodo, caminho, corpo, { token = api.token, cabecalhos = {}, bruto = false } = {}) {
      const resposta = await fetch(base + caminho, {
        method: metodo,
        headers: { ...(corpo !== undefined && !bruto ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...cabecalhos },
        body: corpo === undefined ? undefined : bruto ? corpo : JSON.stringify(corpo),
      });
      const texto = await resposta.text();
      let json = null;
      try { json = texto ? JSON.parse(texto) : null; } catch { /* resposta não-JSON */ }
      return { status: resposta.status, json, texto, headers: resposta.headers };
    },
    /** Cria uma conta, entra e passa a mandar o token em todas as chamadas. */
    async entrar(email = "teste@exemplo.com") {
      await api.req("POST", "/api/v1/auth/registrar", { nome: "Pessoa de Teste", email, senha: "senha-bem-longa" }, { token: null });
      const r = await api.req("POST", "/api/v1/auth/entrar", { email, senha: "senha-bem-longa" }, { token: null });
      api.token = r.json.token;
      return r.json;
    },
    async categoria(nome = "Geral") {
      return (await api.req("POST", "/api/v1/categorias", { nome })).json;
    },
    async produto(extra = {}) {
      const n = (api.contador = (api.contador ?? 0) + 1);
      return (await api.req("POST", "/api/v1/produtos", { sku: `SKU-${n}`, nome: `Produto ${n}`, preco_centavos: 1000, ...extra })).json;
    },
    fechar: () => new Promise((r) => server.close(r)),
  };
  return api;
}
