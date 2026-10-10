import { test } from "node:test";
import assert from "node:assert/strict";
import { subir } from "./ajuda.js";

const C = "/api/v1/categorias";

test("CRUD de categorias com contagem de produtos", async () => {
  const api = await subir();
  try {
    await api.entrar();
    const criada = await api.req("POST", C, { nome: "Papelaria", descricao: "Material de escritório" });
    assert.equal(criada.status, 201);
    assert.equal(criada.json.total_produtos, 0);

    await api.produto({ categoria_id: criada.json.id });
    await api.produto({ categoria_id: criada.json.id });
    assert.equal((await api.req("GET", `${C}/${criada.json.id}`)).json.total_produtos, 2);

    const att = await api.req("PATCH", `${C}/${criada.json.id}`, { descricao: null });
    assert.equal(att.status, 200);
    assert.equal(att.json.descricao, null);
    assert.equal(att.json.nome, "Papelaria");

    const lista = await api.req("GET", C);
    assert.equal(lista.json.meta.total, 1);
  } finally {
    await api.fechar();
  }
});

test("nome é único, validação e ids", async () => {
  const api = await subir();
  try {
    await api.entrar();
    await api.categoria("Casa");
    const repetida = await api.req("POST", C, { nome: "CASA" });
    assert.equal(repetida.status, 409);
    assert.equal(repetida.json.erro.codigo, "nome_em_uso");

    assert.equal((await api.req("POST", C, { nome: "" })).status, 422);
    assert.equal((await api.req("POST", C, {})).status, 422);
    assert.equal((await api.req("PATCH", `${C}/1`, {})).status, 422);
    assert.equal((await api.req("GET", `${C}/abc`)).status, 400);
    assert.equal((await api.req("GET", `${C}/999`)).status, 404);

    const outra = await api.categoria("Jardim");
    assert.equal((await api.req("PATCH", `${C}/${outra.id}`, { nome: "casa" })).status, 409);
  } finally {
    await api.fechar();
  }
});

test("não exclui categoria em uso, mas exclui a vazia", async () => {
  const api = await subir();
  try {
    await api.entrar();
    const usada = await api.categoria("Usada");
    const vazia = await api.categoria("Vazia");
    await api.produto({ categoria_id: usada.id });

    const r = await api.req("DELETE", `${C}/${usada.id}`);
    assert.equal(r.status, 409);
    assert.equal(r.json.erro.codigo, "categoria_em_uso");

    assert.equal((await api.req("DELETE", `${C}/${vazia.id}`)).status, 204);
    assert.equal((await api.req("GET", `${C}/${vazia.id}`)).status, 404);
  } finally {
    await api.fechar();
  }
});
