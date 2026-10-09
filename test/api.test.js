import { test } from "node:test";
import assert from "node:assert/strict";
import { criarApp } from "../src/app.js";

async function subir() {
  const server = criarApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://localhost:${server.address().port}`;
  const req = (metodo, caminho, corpo) =>
    fetch(base + caminho, {
      method: metodo,
      headers: { "content-type": "application/json" },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  return { req, fechar: () => server.close() };
}

test("cria, lista, busca, atualiza e remove um produto", async () => {
  const { req, fechar } = await subir();
  try {
    const criado = await req("POST", "/produtos", { nome: "Armação", preco: 199.9, estoque: 5 });
    assert.equal(criado.status, 201);
    const p = await criado.json();
    assert.equal(p.nome, "Armação");

    assert.equal((await (await req("GET", "/produtos")).json()).length, 1);
    assert.equal((await (await req("GET", "/produtos?q=Arm")).json()).length, 1);
    assert.equal((await (await req("GET", "/produtos?q=zzz")).json()).length, 0);

    const att = await req("PUT", `/produtos/${p.id}`, { preco: 179.9 });
    assert.equal((await att.json()).preco, 179.9);

    assert.equal((await req("DELETE", `/produtos/${p.id}`)).status, 204);
    assert.equal((await req("GET", `/produtos/${p.id}`)).status, 404);
  } finally {
    fechar();
  }
});

test("valida entrada e trata ids inexistentes", async () => {
  const { req, fechar } = await subir();
  try {
    assert.equal((await req("POST", "/produtos", { preco: 10 })).status, 400);
    assert.equal((await req("POST", "/produtos", { nome: "X", preco: -1 })).status, 400);
    assert.equal((await req("POST", "/produtos", { nome: "X", preco: 1, estoque: 1.5 })).status, 400);
    assert.equal((await req("PUT", "/produtos/999", { nome: "Y" })).status, 404);
    assert.equal((await req("DELETE", "/produtos/999")).status, 404);
  } finally {
    fechar();
  }
});
