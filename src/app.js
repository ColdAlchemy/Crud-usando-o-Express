import express from "express";
import Database from "better-sqlite3";

/** Valida o corpo de um produto. Retorna { erro } ou { dados }. */
function validar(body, parcial = false) {
  const { nome, preco, estoque } = body ?? {};
  if (!parcial || nome !== undefined) {
    if (typeof nome !== "string" || !nome.trim()) return { erro: "nome é obrigatório" };
  }
  if (!parcial || preco !== undefined) {
    if (typeof preco !== "number" || !Number.isFinite(preco) || preco < 0) return { erro: "preco deve ser um número >= 0" };
  }
  if (estoque !== undefined && (!Number.isInteger(estoque) || estoque < 0)) return { erro: "estoque deve ser um inteiro >= 0" };
  return { dados: { nome: nome?.trim(), preco, estoque } };
}

export function criarApp(arquivoDb = ":memory:") {
  const db = new Database(arquivoDb);
  db.exec(`CREATE TABLE IF NOT EXISTS produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    preco REAL NOT NULL,
    estoque INTEGER NOT NULL DEFAULT 0
  )`);

  const app = express();
  app.use(express.json());

  app.get("/produtos", (req, res) => {
    const busca = req.query.q ? `%${req.query.q}%` : "%";
    res.json(db.prepare("SELECT * FROM produtos WHERE nome LIKE ? ORDER BY id").all(busca));
  });

  app.get("/produtos/:id", (req, res) => {
    const p = db.prepare("SELECT * FROM produtos WHERE id = ?").get(req.params.id);
    p ? res.json(p) : res.status(404).json({ erro: "produto não encontrado" });
  });

  app.post("/produtos", (req, res) => {
    const { erro, dados } = validar(req.body);
    if (erro) return res.status(400).json({ erro });
    const r = db.prepare("INSERT INTO produtos (nome, preco, estoque) VALUES (?, ?, ?)").run(dados.nome, dados.preco, dados.estoque ?? 0);
    res.status(201).json(db.prepare("SELECT * FROM produtos WHERE id = ?").get(r.lastInsertRowid));
  });

  app.put("/produtos/:id", (req, res) => {
    const atual = db.prepare("SELECT * FROM produtos WHERE id = ?").get(req.params.id);
    if (!atual) return res.status(404).json({ erro: "produto não encontrado" });
    const { erro, dados } = validar(req.body, true);
    if (erro) return res.status(400).json({ erro });
    const novo = {
      nome: dados.nome ?? atual.nome,
      preco: dados.preco ?? atual.preco,
      estoque: dados.estoque ?? atual.estoque,
    };
    db.prepare("UPDATE produtos SET nome = ?, preco = ?, estoque = ? WHERE id = ?").run(novo.nome, novo.preco, novo.estoque, atual.id);
    res.json({ id: atual.id, ...novo });
  });

  app.delete("/produtos/:id", (req, res) => {
    const r = db.prepare("DELETE FROM produtos WHERE id = ?").run(req.params.id);
    r.changes ? res.status(204).end() : res.status(404).json({ erro: "produto não encontrado" });
  });

  return app;
}
