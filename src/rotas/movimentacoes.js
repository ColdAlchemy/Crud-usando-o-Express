import { Router } from "express";
import { consultas, validar } from "../validacao.js";

export function paraApiMovimentacao(m) {
  return {
    id: m.id,
    produto_id: m.produto_id,
    ...(m.produto_sku ? { produto: { id: m.produto_id, sku: m.produto_sku, nome: m.produto_nome } } : {}),
    tipo: m.tipo,
    quantidade: m.quantidade,
    delta: m.delta,
    saldo_apos: m.saldo_apos,
    motivo: m.motivo,
    usuario_id: m.usuario_id,
    criado_em: m.criado_em,
  };
}

/** Histórico geral de movimentações, com filtros por produto, tipo e período. */
export function rotasMovimentacoes({ db }) {
  const r = Router();

  r.get("/", (req, res) => {
    const q = validar(consultas.movimentacoes, req.query, "consulta");
    const filtros = [];
    const params = [];
    if (q.produto_id) { filtros.push("m.produto_id = ?"); params.push(q.produto_id); }
    if (q.tipo) { filtros.push("m.tipo = ?"); params.push(q.tipo); }
    if (q.de) { filtros.push("m.criado_em >= ?"); params.push(`${q.de}T00:00:00.000Z`); }
    if (q.ate) { filtros.push("m.criado_em < date(?, '+1 day')"); params.push(q.ate); }
    const onde = filtros.length ? `WHERE ${filtros.join(" AND ")}` : "";

    const total = db.prepare(`SELECT COUNT(*) AS n FROM movimentacoes m ${onde}`).get(...params).n;
    const dados = db
      .prepare(
        `SELECT m.*, p.sku AS produto_sku, p.nome AS produto_nome
           FROM movimentacoes m JOIN produtos p ON p.id = m.produto_id ${onde}
          ORDER BY m.id DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, q.limite, (q.pagina - 1) * q.limite);

    res.json({ dados: dados.map(paraApiMovimentacao), meta: { pagina: q.pagina, limite: q.limite, total, total_paginas: Math.ceil(total / q.limite) } });
  });

  return r;
}
