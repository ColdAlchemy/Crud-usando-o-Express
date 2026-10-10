import { Router } from "express";
import { ErroApi, conflito, naoEncontrado } from "../erros.js";
import { consultas, idDaUrl, schemas, validar } from "../validacao.js";

export function paraApiCategoria(c) {
  return { id: c.id, nome: c.nome, descricao: c.descricao, total_produtos: c.total_produtos ?? 0, criado_em: c.criado_em };
}

export function rotasCategorias({ db }) {
  const r = Router();
  const SELECT = "SELECT c.*, (SELECT COUNT(*) FROM produtos p WHERE p.categoria_id = c.id) AS total_produtos FROM categorias c";
  const porId = db.prepare(`${SELECT} WHERE c.id = ?`);

  const buscar = (id) => porId.get(id) ?? (() => { throw naoEncontrado("Categoria"); })();
  const nomeLivre = (nome, ignorarId = 0) => {
    const outra = db.prepare("SELECT id FROM categorias WHERE nome = ? AND id != ?").get(nome, ignorarId);
    if (outra) throw conflito("nome_em_uso", "Já existe uma categoria com esse nome.");
  };

  r.get("/", (req, res) => {
    const { pagina, limite } = validar(consultas.paginacao, req.query, "consulta");
    const total = db.prepare("SELECT COUNT(*) AS n FROM categorias").get().n;
    const dados = db.prepare(`${SELECT} ORDER BY c.nome LIMIT ? OFFSET ?`).all(limite, (pagina - 1) * limite);
    res.json({ dados: dados.map(paraApiCategoria), meta: { pagina, limite, total, total_paginas: Math.ceil(total / limite) } });
  });

  r.post("/", (req, res) => {
    const { nome, descricao } = validar(schemas.categoria, req.body);
    nomeLivre(nome);
    const { lastInsertRowid } = db.prepare("INSERT INTO categorias (nome, descricao) VALUES (?, ?)").run(nome, descricao ?? null);
    res.status(201).location(`/api/v1/categorias/${lastInsertRowid}`).json(paraApiCategoria(buscar(lastInsertRowid)));
  });

  r.get("/:id", (req, res) => res.json(paraApiCategoria(buscar(idDaUrl(req.params.id)))));

  r.patch("/:id", (req, res) => {
    const id = idDaUrl(req.params.id);
    const atual = buscar(id);
    const dados = validar(schemas.categoria.partial().refine((d) => Object.keys(d).length > 0, { message: "envie ao menos um campo para atualizar" }), req.body);
    if (dados.nome !== undefined) nomeLivre(dados.nome, id);
    const novo = { nome: dados.nome ?? atual.nome, descricao: dados.descricao === undefined ? atual.descricao : dados.descricao };
    db.prepare("UPDATE categorias SET nome = ?, descricao = ? WHERE id = ?").run(novo.nome, novo.descricao, id);
    res.json(paraApiCategoria(buscar(id)));
  });

  r.delete("/:id", (req, res) => {
    const id = idDaUrl(req.params.id);
    const categoria = buscar(id);
    if (categoria.total_produtos > 0) {
      throw new ErroApi(409, "categoria_em_uso", `Há ${categoria.total_produtos} produto(s) nesta categoria. Mova-os para outra antes de excluir.`);
    }
    db.prepare("DELETE FROM categorias WHERE id = ?").run(id);
    res.status(204).end();
  });

  return r;
}
