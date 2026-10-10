import { hashSenha } from "./auth.js";
import { carregarConfig } from "./config.js";
import { abrirBanco } from "./db.js";
import { criarRegistrador } from "./estoque.js";

/**
 * Dados fictícios para demonstração: 1 usuário, 4 categorias, 16 produtos e ~30 dias de movimentações.
 * Uso: `npm run seed` (não duplica: só roda em banco sem produtos).
 */
export function semear(db, { agora = new Date() } = {}) {
  if (db.prepare("SELECT COUNT(*) AS n FROM produtos").get().n > 0) return false;

  db.prepare("INSERT OR IGNORE INTO usuarios (nome, email, senha_hash) VALUES (?, ?, ?)").run("Ana Demonstração", "demo@estoque.test", hashSenha("demonstracao"));
  const usuario = db.prepare("SELECT id FROM usuarios WHERE email = ?").get("demo@estoque.test").id;

  const categorias = Object.fromEntries(
    [["Vestuário", "Roupas e acessórios"], ["Eletrônicos", "Periféricos e cabos"], ["Papelaria", "Material de escritório"], ["Casa", "Utilidades domésticas"]].map(([nome, descricao]) => [
      nome,
      db.prepare("INSERT INTO categorias (nome, descricao) VALUES (?, ?)").run(nome, descricao).lastInsertRowid,
    ]),
  );

  // sku, nome, preço (centavos), mínimo, categoria, saldo inicial
  const produtos = [
    ["CAM-PRE-M", "Camiseta preta M", 5990, 10, "Vestuário", 40],
    ["CAM-PRE-G", "Camiseta preta G", 5990, 10, "Vestuário", 30],
    ["MOL-CIN-42", "Moletom cinza 42", 14990, 6, "Vestuário", 18],
    ["BON-LAR-UN", "Boné laranja", 3990, 8, "Vestuário", 25],
    ["MOU-SF-01", "Mouse sem fio", 7990, 12, "Eletrônicos", 35],
    ["TEC-MEC-AB", "Teclado mecânico ABNT2", 24990, 5, "Eletrônicos", 14],
    ["CAB-USB-C2", "Cabo USB-C 2 m", 3490, 20, "Eletrônicos", 60],
    ["FON-BT-02", "Fone Bluetooth", 12990, 8, "Eletrônicos", 20],
    ["CAD-A5-PT", "Caderno A5 pautado", 2490, 20, "Papelaria", 80],
    ["CAN-GEL-AZ", "Caneta gel azul (cx 12)", 3290, 15, "Papelaria", 45],
    ["POS-COL-4", "Bloco de recado colorido", 990, 30, "Papelaria", 120],
    ["PAS-A4-10", "Pasta A4 com elástico", 1590, 15, "Papelaria", 50],
    ["GAR-TER-500", "Garrafa térmica 500 ml", 8990, 10, "Casa", 22],
    ["CAN-CER-02", "Caneca de cerâmica", 2990, 15, "Casa", 48],
    ["VEL-AMA-01", "Vela aromática", 4490, 8, "Casa", 16],
    ["PAN-MIC-03", "Pano de microfibra (kit 3)", 1990, 20, "Casa", 70],
  ];

  // Gerador pseudoaleatório fixo: a demonstração sai igual em toda máquina.
  let semente = 20260101;
  const aleatorio = () => ((semente = (semente * 1664525 + 1013904223) % 4294967296) / 4294967296);

  const registrar = criarRegistrador(db);
  const ids = [];
  const preparar = db.prepare("INSERT INTO produtos (sku, nome, preco_centavos, estoque_minimo, categoria_id) VALUES (?, ?, ?, ?, ?)");
  const ajustarData = db.prepare("UPDATE movimentacoes SET criado_em = ? WHERE id = ?");
  const ajustarProduto = db.prepare("UPDATE produtos SET criado_em = ? WHERE id = ?");

  const iso = (diasAtras, hora) => {
    const d = new Date(agora.getTime() - diasAtras * 86_400_000);
    d.setUTCHours(hora, Math.floor(aleatorio() * 60), 0, 0);
    return d.toISOString();
  };

  db.transaction(() => {
    for (const [sku, nome, preco, minimo, categoria, saldo] of produtos) {
      const id = Number(preparar.run(sku, nome, preco, minimo, categorias[categoria]).lastInsertRowid);
      ids.push({ id, saldo });
      ajustarProduto.run(iso(31, 9), id);
      const m = registrar(id, { tipo: "entrada", quantidade: saldo, motivo: "Estoque inicial" }, usuario);
      ajustarData.run(iso(30, 9), m.id);
    }

    // ~30 dias de vendas (saídas) e reposições (entradas); a ordem é cronológica.
    for (let dia = 29; dia >= 0; dia--) {
      for (const { id } of ids) {
        if (aleatorio() < 0.2) {
          const atual = db.prepare("SELECT estoque FROM produtos WHERE id = ?").get(id).estoque;
          const quantidade = Math.min(atual, 1 + Math.floor(aleatorio() * 4));
          if (quantidade > 0) ajustarData.run(iso(dia, 10 + Math.floor(aleatorio() * 9)), registrar(id, { tipo: "saida", quantidade, motivo: "Venda" }, usuario).id);
        }
        if (aleatorio() < 0.06) ajustarData.run(iso(dia, 8), registrar(id, { tipo: "entrada", quantidade: 10 + Math.floor(aleatorio() * 20), motivo: "Reposição de fornecedor" }, usuario).id);
      }
    }
  })();

  // Deixa alguns itens abaixo do mínimo, como numa operação real.
  for (const sku of ["MOU-SF-01", "CAD-A5-PT", "VEL-AMA-01"]) {
    const p = db.prepare("SELECT id, estoque, estoque_minimo FROM produtos WHERE sku = ?").get(sku);
    if (p.estoque > p.estoque_minimo - 2) {
      const alvo = Math.max(0, p.estoque_minimo - 3);
      ajustarData.run(iso(0, 11), registrar(p.id, { tipo: "ajuste", quantidade: alvo, motivo: "Contagem de inventário" }, usuario).id);
    }
  }
  return true;
}

// `node src/seed.js` (ou `npm run seed`)
if (import.meta.url === new URL(`file:///${process.argv[1].replaceAll("\\", "/")}`).href) {
  const { arquivoDb } = carregarConfig();
  const db = abrirBanco(arquivoDb);
  console.log(semear(db) ? `Banco "${arquivoDb}" populado. Login: demo@estoque.test / demonstracao` : `Banco "${arquivoDb}" já tem produtos; nada foi alterado.`);
}
