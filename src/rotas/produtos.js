import { Router } from "express";
import { ErroApi, conflito, naoEncontrado } from "../erros.js";
import { criarRegistrador } from "../estoque.js";
import { consultas, idDaUrl, schemas, validar } from "../validacao.js";
import { paraApiMovimentacao } from "./movimentacoes.js";

export function paraApiProduto(p) {
  return {
    id: p.id,
    sku: p.sku,
    nome: p.nome,
    descricao: p.descricao,
    preco_centavos: p.preco_centavos,
    estoque: p.estoque,
    estoque_minimo: p.estoque_minimo,
    estoque_baixo: Boolean(p.ativo) && p.estoque <= p.estoque_minimo,
    ativo: Boolean(p.ativo),
    categoria: p.categoria_id ? { id: p.categoria_id, nome: p.categoria_nome } : null,
    criado_em: p.criado_em,
    atualizado_em: p.atualizado_em,
  };
}

// Só estas colunas podem ordenar a lista (nunca interpolamos texto do cliente no SQL).
const ORDEM_SQL = {
  id: "p.id",
  nome: "p.nome COLLATE NOCASE",
  sku: "p.sku",
  preco_centavos: "p.preco_centavos",
  estoque: "p.estoque",
  criado_em: "p.criado_em",
};

const SELECT = "SELECT p.*, c.nome AS categoria_nome FROM produtos p LEFT JOIN categorias c ON c.id = p.categoria_id";

export function rotasProdutos({ db }) {
  const r = Router();
  const registrar = criarRegistrador(db);
  const porId = db.prepare(`${SELECT} WHERE p.id = ?`);

  const buscar = (id) => porId.get(id) ?? (() => { throw naoEncontrado("Produto"); })();
  const erroCampo = (campo, mensagem) => new ErroApi(422, "validacao", "Dados inválidos no corpo da requisição.", { campos: [{ campo, mensagem }] });

  function conferirCategoria(id) {
    if (id != null && !db.prepare("SELECT 1 FROM categorias WHERE id = ?").get(id)) throw erroCampo("categoria_id", "a categoria informada não existe");
  }
  function conferirSku(sku, ignorarId = 0) {
    if (db.prepare("SELECT 1 FROM produtos WHERE sku = ? AND id != ?").get(sku, ignorarId)) throw conflito("sku_em_uso", `Já existe um produto com o SKU ${sku}.`);
  }

  r.get("/", (req, res) => {
    const q = validar(consultas.produtos, req.query, "consulta");
    const filtros = [];
    const params = [];

    if (q.q) {
      const termo = `%${q.q.replace(/[\\%_]/g, "\\$&")}%`;
      filtros.push("(p.nome LIKE ? ESCAPE '\\' OR p.sku LIKE ? ESCAPE '\\' OR p.descricao LIKE ? ESCAPE '\\')");
      params.push(termo, termo, termo);
    }
    if (q.categoria_id) { filtros.push("p.categoria_id = ?"); params.push(q.categoria_id); }
    if (q.ativo !== undefined) { filtros.push("p.ativo = ?"); params.push(q.ativo ? 1 : 0); }
    if (q.estoque_baixo === true) filtros.push("p.ativo = 1 AND p.estoque <= p.estoque_minimo");
    if (q.estoque_baixo === false) filtros.push("NOT (p.ativo = 1 AND p.estoque <= p.estoque_minimo)");

    const onde = filtros.length ? `WHERE ${filtros.join(" AND ")}` : "";
    const desc = q.ordem.startsWith("-");
    const coluna = ORDEM_SQL[desc ? q.ordem.slice(1) : q.ordem];

    const total = db.prepare(`SELECT COUNT(*) AS n FROM produtos p ${onde}`).get(...params).n;
    const linhas = db
      .prepare(`${SELECT} ${onde} ORDER BY ${coluna} ${desc ? "DESC" : "ASC"}, p.id LIMIT ? OFFSET ?`)
      .all(...params, q.limite, (q.pagina - 1) * q.limite);

    res.json({
      dados: linhas.map(paraApiProduto),
      meta: { pagina: q.pagina, limite: q.limite, total, total_paginas: Math.ceil(total / q.limite) },
    });
  });

  r.post("/", (req, res) => {
    const d = validar(schemas.produtoNovo, req.body);
    conferirCategoria(d.categoria_id);
    conferirSku(d.sku);

    const id = db.transaction(() => {
      const { lastInsertRowid } = db
        .prepare("INSERT INTO produtos (sku, nome, descricao, preco_centavos, estoque_minimo, ativo, categoria_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(d.sku, d.nome, d.descricao ?? null, d.preco_centavos, d.estoque_minimo, d.ativo ? 1 : 0, d.categoria_id ?? null);
      if (d.estoque_inicial > 0 && d.ativo) {
        registrar(Number(lastInsertRowid), { tipo: "entrada", quantidade: d.estoque_inicial, motivo: "Estoque inicial" }, req.usuario.id);
      } else if (d.estoque_inicial > 0) {
        throw erroCampo("estoque_inicial", "não é possível dar entrada em produto inativo");
      }
      return Number(lastInsertRowid);
    })();

    res.status(201).location(`/api/v1/produtos/${id}`).json(paraApiProduto(buscar(id)));
  });

  r.get("/:id", (req, res) => res.json(paraApiProduto(buscar(idDaUrl(req.params.id)))));

  r.patch("/:id", (req, res) => {
    const id = idDaUrl(req.params.id);
    const atual = buscar(id);
    const d = validar(schemas.produtoEdicao, req.body);
    if ("categoria_id" in d) conferirCategoria(d.categoria_id);
    if (d.sku !== undefined) conferirSku(d.sku, id);

    const novo = {
      sku: d.sku ?? atual.sku,
      nome: d.nome ?? atual.nome,
      descricao: d.descricao === undefined ? atual.descricao : d.descricao,
      preco_centavos: d.preco_centavos ?? atual.preco_centavos,
      estoque_minimo: d.estoque_minimo ?? atual.estoque_minimo,
      ativo: d.ativo === undefined ? atual.ativo : d.ativo ? 1 : 0,
      categoria_id: d.categoria_id === undefined ? atual.categoria_id : d.categoria_id,
    };
    db.prepare(
      `UPDATE produtos SET sku = ?, nome = ?, descricao = ?, preco_centavos = ?, estoque_minimo = ?, ativo = ?, categoria_id = ?,
         atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
    ).run(novo.sku, novo.nome, novo.descricao, novo.preco_centavos, novo.estoque_minimo, novo.ativo, novo.categoria_id, id);

    res.json(paraApiProduto(buscar(id)));
  });

  r.delete("/:id", (req, res) => {
    const id = idDaUrl(req.params.id);
    buscar(id);
    const n = db.prepare("SELECT COUNT(*) AS n FROM movimentacoes WHERE produto_id = ?").get(id).n;
    if (n > 0) {
      throw new ErroApi(409, "produto_com_historico", `Este produto tem ${n} movimentação(ões) registrada(s). Desative-o (PATCH com ativo: false) para preservar o histórico.`);
    }
    db.prepare("DELETE FROM produtos WHERE id = ?").run(id);
    res.status(204).end();
  });

  // ---- Movimentações de um produto ----
  r.get("/:id/movimentacoes", (req, res) => {
    const id = idDaUrl(req.params.id);
    buscar(id);
    const { pagina, limite } = validar(consultas.paginacao, req.query, "consulta");
    const total = db.prepare("SELECT COUNT(*) AS n FROM movimentacoes WHERE produto_id = ?").get(id).n;
    const dados = db.prepare("SELECT * FROM movimentacoes WHERE produto_id = ? ORDER BY id DESC LIMIT ? OFFSET ?").all(id, limite, (pagina - 1) * limite);
    res.json({ dados: dados.map(paraApiMovimentacao), meta: { pagina, limite, total, total_paginas: Math.ceil(total / limite) } });
  });

  r.post("/:id/movimentacoes", (req, res) => {
    const id = idDaUrl(req.params.id);
    const d = validar(schemas.movimentacao, req.body);
    const mov = registrar(id, d, req.usuario.id);
    res.status(201).json({ movimentacao: paraApiMovimentacao(mov), produto: paraApiProduto(buscar(id)) });
  });

  return r;
}
