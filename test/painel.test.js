import { test } from "node:test";
import assert from "node:assert/strict";
import { semear } from "../src/seed.js";
import { subir } from "./ajuda.js";

test("painel vazio devolve zeros e 14 dias preenchidos", async () => {
  const api = await subir();
  try {
    await api.entrar();
    const r = await api.req("GET", "/api/v1/painel");
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.totais, { produtos_ativos: 0, unidades: 0, valor_centavos: 0, sem_estoque: 0, abaixo_do_minimo: 0 });
    assert.equal(r.json.movimentos_por_dia.length, 14);
    assert.equal(r.json.movimentos_por_dia.at(-1).dia, new Date().toISOString().slice(0, 10));
    assert.deepEqual(r.json.por_categoria, []);
  } finally {
    await api.fechar();
  }
});

test("totais, abaixo do mínimo, movimentos e categorias batem com os dados", async () => {
  const api = await subir();
  try {
    await api.entrar();
    const cat = await api.categoria("Casa");
    const a = await api.produto({ sku: "PA", nome: "Produto A", preco_centavos: 1000, estoque_minimo: 10, estoque_inicial: 20, categoria_id: cat.id });
    const b = await api.produto({ sku: "PB", nome: "Produto B", preco_centavos: 250, estoque_minimo: 5, estoque_inicial: 8 });
    const inativo = await api.produto({ sku: "PC", nome: "Produto C", preco_centavos: 9999, estoque_inicial: 100 });
    await api.req("PATCH", `/api/v1/produtos/${inativo.id}`, { ativo: false });

    await api.req("POST", `/api/v1/produtos/${a.id}/movimentacoes`, { tipo: "saida", quantidade: 12 }); // A: 8 (abaixo de 10)
    await api.req("POST", `/api/v1/produtos/${b.id}/movimentacoes`, { tipo: "saida", quantidade: 8 }); // B: 0 (sem estoque)

    const r = (await api.req("GET", "/api/v1/painel")).json;

    assert.equal(r.totais.produtos_ativos, 2); // o inativo não conta
    assert.equal(r.totais.unidades, 8 + 0);
    assert.equal(r.totais.valor_centavos, 8 * 1000);
    assert.equal(r.totais.sem_estoque, 1);
    assert.equal(r.totais.abaixo_do_minimo, 2);

    assert.deepEqual(r.abaixo_do_minimo.map((p) => [p.sku, p.falta]), [["PB", 5], ["PA", 2]]); // do mais crítico para o menos

    const hoje = r.movimentos_por_dia.at(-1);
    assert.deepEqual([hoje.entradas, hoje.saidas], [20 + 8 + 100, 12 + 8]);

    assert.deepEqual(r.mais_saidas.itens.map((i) => [i.sku, i.quantidade]), [["PA", 12], ["PB", 8]]);
    assert.deepEqual(r.por_categoria.map((c) => [c.categoria, c.valor_centavos]), [["Casa", 8000], ["Sem categoria", 0]]);
  } finally {
    await api.fechar();
  }
});

test("o painel exige token", async () => {
  const api = await subir();
  try {
    assert.equal((await api.req("GET", "/api/v1/painel", undefined, { token: null })).status, 401);
  } finally {
    await api.fechar();
  }
});

test("a semente cria dados coerentes e não duplica", async () => {
  const api = await subir();
  try {
    assert.equal(semear(api.db), true);
    assert.equal(semear(api.db), false); // segunda vez: nada muda

    const login = await api.req("POST", "/api/v1/auth/entrar", { email: "demo@estoque.test", senha: "demonstracao" }, { token: null });
    assert.equal(login.status, 200);
    api.token = login.json.token;

    const painel = (await api.req("GET", "/api/v1/painel")).json;
    assert.equal(painel.totais.produtos_ativos, 16);
    assert.ok(painel.abaixo_do_minimo.length >= 3);
    assert.ok(painel.movimentos_por_dia.some((d) => d.saidas > 0));

    // para cada produto, saldo == soma dos deltas
    const incoerentes = api.db
      .prepare("SELECT p.id FROM produtos p WHERE p.estoque != (SELECT COALESCE(SUM(delta), 0) FROM movimentacoes m WHERE m.produto_id = p.id)")
      .all();
    assert.deepEqual(incoerentes, []);
  } finally {
    await api.fechar();
  }
});
