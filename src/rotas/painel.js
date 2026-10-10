import { Router } from "express";

const DIAS_GRAFICO = 14;
const DIAS_RANKING = 30;

const diaIso = (data) => data.toISOString().slice(0, 10);

/** Números do painel de estoque. Tudo calculado a partir dos dados; nada é estimado. */
export function rotasPainel({ db }) {
  const r = Router();

  r.get("/", (req, res) => {
    const totais = db
      .prepare(
        `SELECT COUNT(*) AS produtos_ativos,
                COALESCE(SUM(estoque), 0) AS unidades,
                COALESCE(SUM(estoque * preco_centavos), 0) AS valor_centavos,
                COALESCE(SUM(CASE WHEN estoque = 0 THEN 1 ELSE 0 END), 0) AS sem_estoque,
                COALESCE(SUM(CASE WHEN estoque <= estoque_minimo THEN 1 ELSE 0 END), 0) AS abaixo_do_minimo
           FROM produtos WHERE ativo = 1`,
      )
      .get();

    const baixo = db
      .prepare(
        `SELECT id, sku, nome, estoque, estoque_minimo FROM produtos
          WHERE ativo = 1 AND estoque <= estoque_minimo
          ORDER BY (estoque - estoque_minimo), nome LIMIT 10`,
      )
      .all()
      .map((p) => ({ ...p, falta: p.estoque_minimo - p.estoque }));

    // Movimentações por dia (UTC) nos últimos 14 dias, preenchendo os dias sem movimento com zero.
    const hoje = new Date();
    const inicio = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() - (DIAS_GRAFICO - 1)));
    const porDia = new Map(
      db
        .prepare(
          `SELECT substr(criado_em, 1, 10) AS dia,
                  COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN quantidade END), 0) AS entradas,
                  COALESCE(SUM(CASE WHEN tipo = 'saida' THEN quantidade END), 0) AS saidas
             FROM movimentacoes WHERE criado_em >= ? GROUP BY dia`,
        )
        .all(inicio.toISOString())
        .map((l) => [l.dia, l]),
    );
    const movimentos_por_dia = Array.from({ length: DIAS_GRAFICO }, (_, i) => {
      const dia = diaIso(new Date(inicio.getTime() + i * 86_400_000));
      return { dia, entradas: porDia.get(dia)?.entradas ?? 0, saidas: porDia.get(dia)?.saidas ?? 0 };
    });

    const desde = new Date(hoje.getTime() - DIAS_RANKING * 86_400_000).toISOString();
    const mais_saidas = db
      .prepare(
        `SELECT p.id, p.sku, p.nome, SUM(m.quantidade) AS quantidade
           FROM movimentacoes m JOIN produtos p ON p.id = m.produto_id
          WHERE m.tipo = 'saida' AND m.criado_em >= ?
          GROUP BY p.id ORDER BY quantidade DESC, p.nome LIMIT 5`,
      )
      .all(desde);

    const por_categoria = db
      .prepare(
        `SELECT c.id AS categoria_id, COALESCE(c.nome, 'Sem categoria') AS categoria,
                COUNT(*) AS produtos, SUM(p.estoque) AS unidades, SUM(p.estoque * p.preco_centavos) AS valor_centavos
           FROM produtos p LEFT JOIN categorias c ON c.id = p.categoria_id
          WHERE p.ativo = 1 GROUP BY c.id ORDER BY valor_centavos DESC`,
      )
      .all();

    res.json({
      totais,
      abaixo_do_minimo: baixo,
      movimentos_por_dia,
      mais_saidas: { dias: DIAS_RANKING, itens: mais_saidas },
      por_categoria,
    });
  });

  return r;
}
