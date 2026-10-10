import { test } from "node:test";
import assert from "node:assert/strict";
import { subir } from "./ajuda.js";

const mov = (api, id, corpo) => api.req("POST", `/api/v1/produtos/${id}/movimentacoes`, corpo);

test("entrada, saída e ajuste atualizam o saldo e o histórico", async () => {
  const api = await subir();
  try {
    await api.entrar();
    const p = await api.produto();

    const e = await mov(api, p.id, { tipo: "entrada", quantidade: 10, motivo: "Compra" });
    assert.equal(e.status, 201);
    assert.equal(e.json.produto.estoque, 10);
    assert.deepEqual([e.json.movimentacao.delta, e.json.movimentacao.saldo_apos], [10, 10]);

    const s = await mov(api, p.id, { tipo: "saida", quantidade: 3, motivo: "Venda #1" });
    assert.deepEqual([s.json.movimentacao.delta, s.json.movimentacao.saldo_apos, s.json.produto.estoque], [-3, 7, 7]);

    const a = await mov(api, p.id, { tipo: "ajuste", quantidade: 5, motivo: "Contagem" });
    assert.deepEqual([a.json.movimentacao.delta, a.json.movimentacao.saldo_apos], [-2, 5]);
    const ajusteParaCima = await mov(api, p.id, { tipo: "ajuste", quantidade: 9 });
    assert.equal(ajusteParaCima.json.movimentacao.delta, 4);

    const hist = await api.req("GET", `/api/v1/produtos/${p.id}/movimentacoes`);
    assert.deepEqual(hist.json.dados.map((m) => m.tipo), ["ajuste", "ajuste", "saida", "entrada"]); // mais recente primeiro
    assert.equal(hist.json.dados.find((m) => m.motivo === "Venda #1").usuario_id !== null, true);

    // a soma dos deltas é sempre igual ao saldo
    const soma = api.db.prepare("SELECT SUM(delta) AS s FROM movimentacoes WHERE produto_id = ?").get(p.id).s;
    assert.equal(soma, (await api.req("GET", `/api/v1/produtos/${p.id}`)).json.estoque);
  } finally {
    await api.fechar();
  }
});

test("saída maior que o saldo é recusada com 409 e nada é gravado", async () => {
  const api = await subir();
  try {
    await api.entrar();
    const p = await api.produto({ estoque_inicial: 4 });

    const r = await mov(api, p.id, { tipo: "saida", quantidade: 5 });
    assert.equal(r.status, 409);
    assert.equal(r.json.erro.codigo, "estoque_insuficiente");
    assert.equal(r.json.erro.saldo_atual, 4);

    assert.equal((await api.req("GET", `/api/v1/produtos/${p.id}`)).json.estoque, 4);
    assert.equal(api.db.prepare("SELECT COUNT(*) AS n FROM movimentacoes WHERE produto_id = ?").get(p.id).n, 1); // só o estoque inicial

    // sair exatamente o saldo é permitido
    assert.equal((await mov(api, p.id, { tipo: "saida", quantidade: 4 })).json.produto.estoque, 0);
  } finally {
    await api.fechar();
  }
});

test("validação das movimentações", async () => {
  const api = await subir();
  try {
    await api.entrar();
    const p = await api.produto();

    for (const corpo of [
      {}, { tipo: "entrada" }, { quantidade: 1 },
      { tipo: "roubo", quantidade: 1 },
      { tipo: "entrada", quantidade: 0 }, { tipo: "saida", quantidade: 0 },
      { tipo: "entrada", quantidade: -3 }, { tipo: "entrada", quantidade: 1.5 }, { tipo: "entrada", quantidade: "10" },
      { tipo: "entrada", quantidade: 1, motivo: "x".repeat(201) },
      { tipo: "entrada", quantidade: 1, usuario_id: 99 },
    ]) {
      const r = await mov(api, p.id, corpo);
      assert.equal(r.status, 422, JSON.stringify(corpo));
    }
    assert.equal((await mov(api, p.id, { tipo: "ajuste", quantidade: 0 })).status, 201); // zerar pelo inventário é válido
    assert.equal((await mov(api, 999, { tipo: "entrada", quantidade: 1 })).status, 404);
    assert.equal((await mov(api, "abc", { tipo: "entrada", quantidade: 1 })).status, 400);
  } finally {
    await api.fechar();
  }
});

test("saídas simultâneas nunca deixam o saldo negativo", async () => {
  const api = await subir();
  try {
    await api.entrar();
    const p = await api.produto({ estoque_inicial: 10 });

    const respostas = await Promise.all(Array.from({ length: 20 }, () => mov(api, p.id, { tipo: "saida", quantidade: 1 })));
    const ok = respostas.filter((r) => r.status === 201).length;
    const recusadas = respostas.filter((r) => r.status === 409).length;

    assert.equal(ok, 10);
    assert.equal(recusadas, 10);
    assert.equal((await api.req("GET", `/api/v1/produtos/${p.id}`)).json.estoque, 0);
  } finally {
    await api.fechar();
  }
});

test("histórico geral filtra por produto, tipo e período", async () => {
  const api = await subir();
  try {
    await api.entrar();
    const a = await api.produto({ sku: "AAA", estoque_inicial: 10 });
    const b = await api.produto({ sku: "BBB", estoque_inicial: 10 });
    await mov(api, a.id, { tipo: "saida", quantidade: 1 });
    await mov(api, b.id, { tipo: "saida", quantidade: 2 });

    const todas = await api.req("GET", "/api/v1/movimentacoes");
    assert.equal(todas.json.meta.total, 4);
    assert.equal(todas.json.dados[0].produto.sku, "BBB"); // mais recente primeiro, com o produto junto

    assert.equal((await api.req("GET", `/api/v1/movimentacoes?produto_id=${a.id}`)).json.meta.total, 2);
    assert.equal((await api.req("GET", "/api/v1/movimentacoes?tipo=saida")).json.meta.total, 2);
    assert.equal((await api.req("GET", "/api/v1/movimentacoes?tipo=ajuste")).json.meta.total, 0);

    const hoje = new Date().toISOString().slice(0, 10);
    assert.equal((await api.req("GET", `/api/v1/movimentacoes?de=${hoje}&ate=${hoje}`)).json.meta.total, 4); // "ate" inclui o dia inteiro
    assert.equal((await api.req("GET", "/api/v1/movimentacoes?ate=2000-01-01")).json.meta.total, 0);
    assert.equal((await api.req("GET", "/api/v1/movimentacoes?de=ontem")).status, 422);
    assert.equal((await api.req("GET", "/api/v1/movimentacoes?tipo=xyz")).status, 422);
  } finally {
    await api.fechar();
  }
});

test("as movimentações exigem token", async () => {
  const api = await subir();
  try {
    assert.equal((await api.req("GET", "/api/v1/movimentacoes", undefined, { token: null })).status, 401);
    assert.equal((await api.req("POST", "/api/v1/produtos/1/movimentacoes", { tipo: "entrada", quantidade: 1 }, { token: null })).status, 401);
  } finally {
    await api.fechar();
  }
});
