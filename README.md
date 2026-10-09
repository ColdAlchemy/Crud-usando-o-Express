# CRUD com Express

API REST de produtos (criar, listar, buscar, atualizar e remover) com Node.js, Express e SQLite.

> Projeto de **Albert Ryan**, desenvolvido com apoio de IA (Claude Code).

## Endpoints
| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/produtos?q=termo` | Lista produtos, com busca opcional por nome |
| `GET` | `/produtos/:id` | Busca um produto |
| `POST` | `/produtos` | Cria (`nome`, `preco`, `estoque` opcional) |
| `PUT` | `/produtos/:id` | Atualiza campos do produto |
| `DELETE` | `/produtos/:id` | Remove |

Entradas inválidas retornam `400` e ids inexistentes retornam `404`.

## Como rodar
```bash
npm install
npm start        # http://localhost:3000 (banco em produtos.db)
npm test         # testes com node:test
```

## Stack
Node.js 22 · Express · better-sqlite3
