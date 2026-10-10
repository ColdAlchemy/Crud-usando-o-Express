import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { hashSenha, conferirSenha } from "../src/auth.js";
import { subir } from "./ajuda.js";

const NOVO = { nome: "Ana Souza", email: "ana@exemplo.com", senha: "senha-bem-longa" };

test("hash de senha usa sal e confere só a senha certa", () => {
  const a = hashSenha("segredo123");
  const b = hashSenha("segredo123");
  assert.notEqual(a, b); // sal diferente a cada vez
  assert.ok(!a.includes("segredo123"));
  assert.equal(conferirSenha("segredo123", a), true);
  assert.equal(conferirSenha("outra-senha", a), false);
});

test("registra, entra e usa o token", async () => {
  const api = await subir();
  try {
    const criado = await api.req("POST", "/api/v1/auth/registrar", NOVO, { token: null });
    assert.equal(criado.status, 201);
    assert.equal(criado.json.usuario.email, "ana@exemplo.com");
    assert.equal(criado.json.usuario.senha_hash, undefined); // nunca devolve o hash

    const login = await api.req("POST", "/api/v1/auth/entrar", { email: "ANA@exemplo.com", senha: NOVO.senha }, { token: null });
    assert.equal(login.status, 200);
    assert.equal(login.json.tipo, "Bearer");
    assert.ok(login.json.token.split(".").length === 3);

    const eu = await api.req("GET", "/api/v1/auth/eu", undefined, { token: login.json.token });
    assert.equal(eu.json.usuario.nome, "Ana Souza");
  } finally {
    await api.fechar();
  }
});

test("registro valida campos e recusa e-mail repetido (sem diferenciar maiúsculas)", async () => {
  const api = await subir();
  try {
    const ruim = await api.req("POST", "/api/v1/auth/registrar", { nome: "A", email: "nao-e-email", senha: "curta" }, { token: null });
    assert.equal(ruim.status, 422);
    assert.deepEqual(ruim.json.erro.campos.map((c) => c.campo).sort(), ["email", "nome", "senha"]);

    await api.req("POST", "/api/v1/auth/registrar", NOVO, { token: null });
    const repetido = await api.req("POST", "/api/v1/auth/registrar", { ...NOVO, email: "ANA@Exemplo.com" }, { token: null });
    assert.equal(repetido.status, 409);
    assert.equal(repetido.json.erro.codigo, "email_em_uso");

    const extra = await api.req("POST", "/api/v1/auth/registrar", { ...NOVO, email: "b@exemplo.com", admin: true }, { token: null });
    assert.equal(extra.status, 422); // campos desconhecidos são recusados
  } finally {
    await api.fechar();
  }
});

test("login com senha errada ou e-mail inexistente dá a mesma resposta 401", async () => {
  const api = await subir();
  try {
    await api.req("POST", "/api/v1/auth/registrar", NOVO, { token: null });
    const errada = await api.req("POST", "/api/v1/auth/entrar", { email: NOVO.email, senha: "senha-errada" }, { token: null });
    const inexistente = await api.req("POST", "/api/v1/auth/entrar", { email: "ninguem@exemplo.com", senha: "qualquer" }, { token: null });
    assert.equal(errada.status, 401);
    assert.deepEqual(errada.json, inexistente.json);
    assert.equal(errada.json.erro.codigo, "credenciais_invalidas");
  } finally {
    await api.fechar();
  }
});

test("rotas protegidas recusam sem token, com token ruim, adulterado, expirado ou alg none", async () => {
  const api = await subir();
  try {
    const { token } = await api.entrar();
    const config = api.app.locals.config;

    const sem = await api.req("GET", "/api/v1/produtos", undefined, { token: null });
    assert.equal(sem.status, 401);
    assert.equal(sem.json.erro.codigo, "nao_autenticado");
    assert.match(sem.headers.get("www-authenticate"), /Bearer/);

    const lixo = await api.req("GET", "/api/v1/produtos", undefined, { token: "isto.nao.e-jwt" });
    assert.equal(lixo.json.erro.codigo, "token_invalido");

    const adulterado = token.slice(0, -4) + (token.endsWith("AAAA") ? "BBBB" : "AAAA");
    assert.equal((await api.req("GET", "/api/v1/produtos", undefined, { token: adulterado })).json.erro.codigo, "token_invalido");

    const outroSegredo = jwt.sign({ sub: "1" }, "outro-segredo", { algorithm: "HS256" });
    assert.equal((await api.req("GET", "/api/v1/produtos", undefined, { token: outroSegredo })).status, 401);

    const expirado = jwt.sign({ sub: "1" }, config.jwtSecret, { algorithm: "HS256", expiresIn: -10 });
    const r = await api.req("GET", "/api/v1/produtos", undefined, { token: expirado });
    assert.equal(r.status, 401);
    assert.equal(r.json.erro.codigo, "token_expirado");

    // token sem assinatura ("alg: none") não pode passar
    const semAssinatura = [Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url"), Buffer.from('{"sub":"1"}').toString("base64url"), ""].join(".");
    assert.equal((await api.req("GET", "/api/v1/produtos", undefined, { token: semAssinatura })).status, 401);

    // esquema errado
    const basic = await api.req("GET", "/api/v1/produtos", undefined, { token: null, cabecalhos: { authorization: "Basic abc" } });
    assert.equal(basic.status, 401);
  } finally {
    await api.fechar();
  }
});

test("token de usuário que deixou de existir é recusado", async () => {
  const api = await subir();
  try {
    await api.entrar();
    api.db.prepare("DELETE FROM usuarios").run();
    const r = await api.req("GET", "/api/v1/auth/eu");
    assert.equal(r.status, 401);
  } finally {
    await api.fechar();
  }
});

test("limite de tentativas nas rotas de autenticação devolve 429 com Retry-After", async () => {
  const api = await subir({ config: { limiteAuth: { max: 3, janelaMs: 60_000 } } });
  try {
    const tentar = () => api.req("POST", "/api/v1/auth/entrar", { email: "x@exemplo.com", senha: "errada" }, { token: null });
    for (let i = 0; i < 3; i++) assert.equal((await tentar()).status, 401);
    const bloqueada = await tentar();
    assert.equal(bloqueada.status, 429);
    assert.equal(bloqueada.json.erro.codigo, "limite_excedido");
    assert.ok(Number(bloqueada.headers.get("retry-after")) > 0);
    assert.equal(bloqueada.headers.get("ratelimit-remaining"), "0");
  } finally {
    await api.fechar();
  }
});
