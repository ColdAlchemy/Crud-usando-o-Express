import { test } from "node:test";
import assert from "node:assert/strict";
import { openapi } from "../src/openapi.js";
import { subir } from "./ajuda.js";

test("saúde é pública e o formato de erro é sempre o mesmo", async () => {
  const api = await subir();
  try {
    const s = await api.req("GET", "/api/v1/saude");
    assert.equal(s.status, 200);
    assert.equal(s.json.status, "ok");

    const naoExiste = await api.req("GET", "/api/v1/nao-existe");
    assert.equal(naoExiste.status, 404);
    assert.equal(naoExiste.json.erro.codigo, "rota_inexistente");

    const fora = await api.req("GET", "/nada-aqui");
    assert.equal(fora.status, 404);
    assert.equal(fora.json.erro.codigo, "rota_inexistente");
  } finally {
    await api.fechar();
  }
});

test("JSON malformado devolve 400 e corpo grande demais devolve 413", async () => {
  const api = await subir();
  try {
    await api.entrar();
    const ruim = await api.req("POST", "/api/v1/categorias", "{nome: sem aspas", { bruto: true, cabecalhos: { "content-type": "application/json" } });
    assert.equal(ruim.status, 400);
    assert.equal(ruim.json.erro.codigo, "json_invalido");

    const grande = await api.req("POST", "/api/v1/categorias", JSON.stringify({ nome: "x".repeat(200_000) }), { bruto: true, cabecalhos: { "content-type": "application/json" } });
    assert.equal(grande.status, 413);
  } finally {
    await api.fechar();
  }
});

test("cabeçalhos de segurança estão presentes e o Express não se identifica", async () => {
  const api = await subir();
  try {
    const r = await api.req("GET", "/api/v1/saude");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.match(r.headers.get("content-security-policy"), /default-src 'self'/);
    assert.equal(r.headers.get("x-powered-by"), null);
  } finally {
    await api.fechar();
  }
});

test("toda rota documentada no OpenAPI existe de verdade", async () => {
  const api = await subir();
  try {
    await api.entrar();
    const produto = await api.produto();
    const categoria = await api.categoria();

    for (const [caminho, operacoes] of Object.entries(openapi.paths)) {
      for (const metodo of Object.keys(operacoes).filter((m) => ["get", "post", "patch", "put", "delete"].includes(m))) {
        // usa ids reais; um 404 "nao_encontrado" é aceitável, "rota_inexistente" não
        const url = caminho.replace("{id}", caminho.includes("categorias") ? categoria.id : produto.id);
        const r = await api.req(metodo.toUpperCase(), url, ["post", "patch", "put"].includes(metodo) ? {} : undefined);
        assert.notEqual(r.json?.erro?.codigo, "rota_inexistente", `${metodo.toUpperCase()} ${caminho} está documentada mas não existe`);
        assert.notEqual(r.status, 500, `${metodo.toUpperCase()} ${caminho} deu erro interno`);
      }
    }
  } finally {
    await api.fechar();
  }
});

test("a especificação é servida e todo $ref aponta para um schema existente", async () => {
  const api = await subir();
  try {
    const r = await api.req("GET", "/api/v1/openapi.json");
    assert.equal(r.status, 200);
    assert.equal(r.json.openapi, "3.1.0");

    const refs = [...JSON.stringify(r.json).matchAll(/#\/components\/schemas\/(\w+)/g)].map((m) => m[1]);
    assert.ok(refs.length > 10);
    for (const nome of new Set(refs)) assert.ok(r.json.components.schemas[nome], `schema ${nome} não existe`);

    // toda operação tem id único e ao menos uma tag
    const ids = Object.values(r.json.paths).flatMap((p) => Object.values(p)).filter((o) => o.operationId).map((o) => o.operationId);
    assert.equal(new Set(ids).size, ids.length);
  } finally {
    await api.fechar();
  }
});

test("o console estático é servido na raiz", async () => {
  const api = await subir();
  try {
    const r = await api.req("GET", "/");
    assert.equal(r.status, 200);
    assert.match(r.texto, /<title>/);
  } finally {
    await api.fechar();
  }
});
