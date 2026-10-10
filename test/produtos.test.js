import { test } from "node:test";
import assert from "node:assert/strict";
import { subir } from "./ajuda.js";

const P = "/api/v1/produtos";

test("cria produto com estoque inicial, busca, atualiza e remove", async () => {
  const api = await subir();
  try {
    await api.entrar();
    const cat = await api.categoria("Vestuário");

    const criado = await api.req("POST", P, { sku: "CAM-PRE-M", nome: "Camiseta preta M", preco_centavos: 5990, estoque_minimo: 10, categoria_id: cat.id, estoque_inicial: 25 });
    assert.equal(criado.status, 201);
    assert.match(criado.headers.get("location"), /\/api\/v1\/produtos\/\d+$/);
    const p = criado.json;
    assert.equal(p.estoque, 25);
    assert.equal(p.estoque_baixo, false);
    assert.equal(p.ativo, true);
    assert.deepEqual(p.categoria, { id: cat.id, nome: "Vestuário" });

    // o estoque inicial virou uma movimentação, não um número solto
    const hist = await api.req("GET", `${P}/${p.id}/movimentacoes`);
    assert.equal(hist.json.dados.length, 1);
    assert.equal(hist.json.dados[0].motivo, "Estoque inicial");

    assert.equal((await api.req("GET", `${P}/${p.id}`)).json.sku, "CAM-PRE-M");

    const att = await api.req("PATCH", `${P}/${p.id}`, { preco_centavos: 6490, descricao: "Algodão" });
    assert.equal(att.status, 200);
    assert.equal(att.json.preco_centavos, 6490);
    assert.equal(att.json.nome, "Camiseta preta M"); // campos não enviados ficam como estavam
    assert.equal(att.json.estoque, 25);

    // com histórico, não pode excluir (só desativar)
    const bloqueado = await api.req("DELETE", `${P}/${p.id}`);
    assert.equal(bloqueado.status, 409);
    assert.equal(bloqueado.json.erro.codigo, "produto_com_historico");

    const sem = await api.produto();
    assert.equal((await api.req("DELETE", `${P}/${sem.id}`)).status, 204);
    assert.equal((await api.req("GET", `${P}/${sem.id}`)).status, 404);
  } finally {
    await api.fechar();
  }
});

test("valida o cadastro campo a campo", async () => {
  const api = await subir();
  try {
    await api.entrar();
    const r = await api.req("POST", P, { sku: "x y", nome: "", preco_centavos: -5, estoque_minimo: 1.5, ativo: "sim", categoria_id: 0 });
    assert.equal(r.status, 422);
    assert.equal(r.json.erro.codigo, "validacao");
    const campos = r.json.erro.campos.map((c) => c.campo);
    for (const c of ["sku", "nome", "preco_centavos", "estoque_minimo", "ativo", "categoria_id"]) assert.ok(campos.includes(c), `faltou erro em ${c}`);

    assert.equal((await api.req("POST", P, { nome: "Sem sku", preco_centavos: 100 })).status, 422);
    assert.equal((await api.req("POST", P, { sku: "OK-1", nome: "Preço decimal", preco_centavos: 59.9 })).status, 422); // centavos são inteiros
    assert.equal((await api.req("POST", P, { sku: "OK-2", nome: "Estoque direto", preco_centavos: 100, estoque: 99 })).status, 422); // saldo só por movimentação
    assert.equal((await api.req("POST", P, { sku: "OK-3", nome: "Categoria fantasma", preco_centavos: 100, categoria_id: 999 })).status, 422);
    assert.equal((await api.req("PATCH", `${P}/1`, {})).status, 404);
  } finally {
    await api.fechar();
  }
});

test("SKU é único (sem diferenciar maiúsculas), também na edição", async () => {
  const api = await subir();
  try {
    await api.entrar();
    const a = await api.produto({ sku: "ABC-1" });
    const b = await api.produto({ sku: "ABC-2" });

    const repetido = await api.req("POST", P, { sku: "abc-1", nome: "Outro", preco_centavos: 100 });
    assert.equal(repetido.status, 409);
    assert.equal(repetido.json.erro.codigo, "sku_em_uso");

    assert.equal((await api.req("PATCH", `${P}/${b.id}`, { sku: "ABC-1" })).status, 409);
    assert.equal((await api.req("PATCH", `${P}/${a.id}`, { sku: "ABC-1" })).status, 200); // o próprio SKU não conta
  } finally {
    await api.fechar();
  }
});

test("ids inválidos devolvem 400 e inexistentes 404", async () => {
  const api = await subir();
  try {
    await api.entrar();
    for (const id of ["abc", "0", "-1", "1.5", "1e3"]) {
      const r = await api.req("GET", `${P}/${id}`);
      assert.equal(r.status, 400, `id ${id}`);
      assert.equal(r.json.erro.codigo, "id_invalido");
    }
    assert.equal((await api.req("GET", `${P}/999`)).status, 404);
    assert.equal((await api.req("PATCH", `${P}/999`, { nome: "X" })).status, 404);
    assert.equal((await api.req("DELETE", `${P}/999`)).status, 404);
  } finally {
    await api.fechar();
  }
});

test("listagem pagina e informa o total", async () => {
  const api = await subir();
  try {
    await api.entrar();
    for (let i = 1; i <= 7; i++) await api.produto({ nome: `Item ${i}` });

    const p1 = await api.req("GET", `${P}?limite=3`);
    assert.deepEqual(p1.json.meta, { pagina: 1, limite: 3, total: 7, total_paginas: 3 });
    assert.equal(p1.json.dados.length, 3);

    const p3 = await api.req("GET", `${P}?limite=3&pagina=3`);
    assert.equal(p3.json.dados.length, 1);
    assert.equal((await api.req("GET", `${P}?limite=3&pagina=4`)).json.dados.length, 0);

    const padrao = await api.req("GET", P);
    assert.equal(padrao.json.meta.limite, 20);

    for (const q of ["limite=0", "limite=101", "pagina=0", "pagina=abc"]) assert.equal((await api.req("GET", `${P}?${q}`)).status, 422, q);
  } finally {
    await api.fechar();
  }
});

test("busca, filtros e ordenação", async () => {
  const api = await subir();
  try {
    await api.entrar();
    const roupa = await api.categoria("Roupa");
    await api.produto({ sku: "B-1", nome: "Banana prata", preco_centavos: 500, categoria_id: roupa.id, estoque_inicial: 5, estoque_minimo: 10 });
    await api.produto({ sku: "A-2", nome: "abacaxi", preco_centavos: 900, estoque_inicial: 50 });
    await api.produto({ sku: "C-3", nome: "Caju", preco_centavos: 100, ativo: false });

    const nomes = async (qs) => (await api.req("GET", `${P}?${qs}`)).json.dados.map((p) => p.nome);

    assert.deepEqual(await nomes("q=ban"), ["Banana prata"]);
    assert.deepEqual(await nomes("q=A-2"), ["abacaxi"]); // busca também no SKU
    assert.deepEqual(await nomes(`categoria_id=${roupa.id}`), ["Banana prata"]);
    assert.deepEqual(await nomes("ativo=false"), ["Caju"]);
    assert.deepEqual(await nomes("ativo=true&ordem=nome"), ["abacaxi", "Banana prata"]); // ordem sem diferenciar maiúsculas
    assert.deepEqual(await nomes("estoque_baixo=true"), ["Banana prata"]); // 5 <= mínimo 10
    assert.deepEqual(await nomes("ordem=-preco_centavos"), ["abacaxi", "Banana prata", "Caju"]);
    assert.deepEqual(await nomes("ordem=estoque"), ["Caju", "Banana prata", "abacaxi"]);
  } finally {
    await api.fechar();
  }
});

test("a busca trata % e _ como texto comum e a ordenação só aceita colunas conhecidas", async () => {
  const api = await subir();
  try {
    await api.entrar();
    await api.produto({ nome: "Desconto 50%" });
    await api.produto({ nome: "Outro produto" });

    assert.deepEqual((await api.req("GET", `${P}?q=${encodeURIComponent("50%")}`)).json.dados.map((p) => p.nome), ["Desconto 50%"]);
    assert.equal((await api.req("GET", `${P}?q=${encodeURIComponent("%")}`)).json.meta.total, 1);
    assert.equal((await api.req("GET", `${P}?q=${encodeURIComponent("_")}`)).json.meta.total, 0);

    // tentativa de injeção de SQL pela ordenação ou pela busca
    assert.equal((await api.req("GET", `${P}?ordem=${encodeURIComponent("id; DROP TABLE produtos")}`)).status, 422);
    assert.equal((await api.req("GET", `${P}?ordem=senha_hash`)).status, 422);
    assert.equal((await api.req("GET", `${P}?q=${encodeURIComponent("' OR 1=1 --")}`)).json.meta.total, 0);
    assert.equal((await api.req("GET", P)).json.meta.total, 2); // a tabela segue intacta
  } finally {
    await api.fechar();
  }
});

test("produto inativo não recebe entrada inicial nem movimentação", async () => {
  const api = await subir();
  try {
    await api.entrar();
    const r = await api.req("POST", P, { sku: "INAT-1", nome: "Inativo", preco_centavos: 100, ativo: false, estoque_inicial: 5 });
    assert.equal(r.status, 422);
    assert.equal((await api.req("GET", `${P}?ativo=false`)).json.meta.total, 0); // nada ficou gravado pela metade

    const p = await api.produto({ estoque_inicial: 5 });
    await api.req("PATCH", `${P}/${p.id}`, { ativo: false });
    const mov = await api.req("POST", `${P}/${p.id}/movimentacoes`, { tipo: "entrada", quantidade: 1 });
    assert.equal(mov.status, 409);
    assert.equal(mov.json.erro.codigo, "produto_inativo");
  } finally {
    await api.fechar();
  }
});

test("estoque_baixo reflete mínimo e saldo", async () => {
  const api = await subir();
  try {
    await api.entrar();
    const p = await api.produto({ estoque_minimo: 5, estoque_inicial: 6 });
    assert.equal(p.estoque_baixo, false);
    const saida = await api.req("POST", `${P}/${p.id}/movimentacoes`, { tipo: "saida", quantidade: 1 });
    assert.equal(saida.json.produto.estoque_baixo, true); // 5 <= 5
  } finally {
    await api.fechar();
  }
});
