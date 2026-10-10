import Database from "better-sqlite3";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE COLLATE NOCASE,
  descricao TEXT,
  criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Preço em centavos (inteiro): evita erro de arredondamento com ponto flutuante.
-- "estoque" é o saldo atual; o histórico que o explica fica em "movimentacoes".
CREATE TABLE IF NOT EXISTS produtos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nome TEXT NOT NULL,
  descricao TEXT,
  preco_centavos INTEGER NOT NULL CHECK (preco_centavos >= 0),
  estoque INTEGER NOT NULL DEFAULT 0 CHECK (estoque >= 0),
  estoque_minimo INTEGER NOT NULL DEFAULT 0 CHECK (estoque_minimo >= 0),
  ativo INTEGER NOT NULL DEFAULT 1,
  categoria_id INTEGER REFERENCES categorias (id),
  criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_produtos_categoria ON produtos (categoria_id);
CREATE INDEX IF NOT EXISTS idx_produtos_nome ON produtos (nome);

-- Cada alteração de saldo vira uma linha: entrada (+), saída (-) ou ajuste (contagem de inventário).
CREATE TABLE IF NOT EXISTS movimentacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  produto_id INTEGER NOT NULL REFERENCES produtos (id),
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida', 'ajuste')),
  quantidade INTEGER NOT NULL CHECK (quantidade >= 0),
  delta INTEGER NOT NULL,
  saldo_apos INTEGER NOT NULL CHECK (saldo_apos >= 0),
  motivo TEXT,
  usuario_id INTEGER REFERENCES usuarios (id),
  criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_mov_produto ON movimentacoes (produto_id, id);
CREATE INDEX IF NOT EXISTS idx_mov_data ON movimentacoes (criado_em);
`;

export function abrirBanco(arquivo = ":memory:") {
  const db = new Database(arquivo);
  db.pragma("foreign_keys = ON");
  if (arquivo !== ":memory:") db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  return db;
}
