import { ErroApi, naoEncontrado } from "./erros.js";

/**
 * Registra uma movimentação e atualiza o saldo do produto na MESMA transação:
 * ou os dois acontecem, ou nenhum. Regras:
 *  - entrada: soma `quantidade` ao saldo;
 *  - saída: subtrai (e recusa com 409 se o saldo ficaria negativo);
 *  - ajuste: `quantidade` é o saldo contado no inventário; o delta é a diferença.
 */
export function criarRegistrador(db) {
  const buscar = db.prepare("SELECT id, estoque, ativo FROM produtos WHERE id = ?");
  const atualizar = db.prepare("UPDATE produtos SET estoque = ?, atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?");
  const inserir = db.prepare(
    "INSERT INTO movimentacoes (produto_id, tipo, quantidade, delta, saldo_apos, motivo, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const lerMov = db.prepare("SELECT * FROM movimentacoes WHERE id = ?");

  return db.transaction((produtoId, { tipo, quantidade, motivo }, usuarioId = null) => {
    const produto = buscar.get(produtoId);
    if (!produto) throw naoEncontrado("Produto");
    if (!produto.ativo) throw new ErroApi(409, "produto_inativo", "Este produto está inativo. Reative-o (ativo: true) antes de movimentar o estoque.");

    const delta = tipo === "entrada" ? quantidade : tipo === "saida" ? -quantidade : quantidade - produto.estoque;
    const saldo = produto.estoque + delta;
    if (saldo < 0) {
      throw new ErroApi(409, "estoque_insuficiente", `Saldo atual (${produto.estoque}) é menor que a saída pedida (${quantidade}).`, {
        saldo_atual: produto.estoque,
      });
    }

    atualizar.run(saldo, produtoId);
    const { lastInsertRowid } = inserir.run(produtoId, tipo, quantidade, delta, saldo, motivo ?? null, usuarioId);
    return lerMov.get(lastInsertRowid);
  });
}
