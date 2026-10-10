# Estoque API — Express, SQLite e um console de desenvolvedor

API REST de controle de estoque: **produtos, categorias e movimentações** (entrada, saída e ajuste), com **autenticação JWT**, paginação, filtros e ordenação. Vem com um **console** servido pela própria API: guia de primeiros passos, **documentação OpenAPI interativa com playground** e um **painel de estoque**.

> Desenvolvido por mim com o auxílio do Claude Code. Eu defini o escopo, revisei e estudei o código. Dados de demonstração fictícios.

## Como rodar
```bash
npm install
npm run seed      # opcional: 16 produtos, 4 categorias e ~30 dias de movimentações fictícias
npm start         # http://localhost:3000  (console em /, docs em /#/docs)
npm test          # 35 testes (node:test), sem rede e com banco em memória
```
Login da demonstração (criado pelo `seed`): `demo@estoque.test` / `demonstracao`.

Com Docker (**não testei neste computador**, que não tem Docker; o `Dockerfile` e o `docker-compose.yml` seguem o padrão e estão aqui para uso futuro):
```bash
echo "JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")" > .env
docker compose up --build
docker compose run --rm api node src/seed.js   # dados de demonstração (opcional)
```

## Primeira chamada
```bash
curl -X POST http://localhost:3000/api/v1/auth/entrar -H "Content-Type: application/json" \
  -d '{"email":"demo@estoque.test","senha":"demonstracao"}'          # → { "token": "eyJ…" }

curl "http://localhost:3000/api/v1/produtos?limite=3&ordem=-preco_centavos" \
  -H "Authorization: Bearer $TOKEN"

curl -X POST http://localhost:3000/api/v1/produtos/1/movimentacoes \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"tipo":"saida","quantidade":2,"motivo":"Venda #1042"}'
```

## Endpoints (`/api/v1`)
| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/saude` | Verificação de saúde (pública) |
| `GET` | `/openapi.json` | Especificação OpenAPI 3.1 (pública) |
| `POST` | `/auth/registrar` · `/auth/entrar` | Cria conta · troca e-mail e senha por um JWT (limite de tentativas por IP) |
| `GET` | `/auth/eu` | Usuário do token |
| `GET` `POST` | `/produtos` | Lista (paginada, com `q`, `categoria_id`, `ativo`, `estoque_baixo`, `ordem`) · cadastra (aceita `estoque_inicial`) |
| `GET` `PATCH` `DELETE` | `/produtos/{id}` | Busca · atualiza campos · exclui (só sem histórico; senão, desative) |
| `GET` `POST` | `/produtos/{id}/movimentacoes` | Histórico do produto · registra entrada, saída ou ajuste |
| `GET` | `/movimentacoes` | Histórico geral, com filtros por produto, tipo e período |
| `GET` `POST` | `/categorias` | Lista · cria |
| `GET` `PATCH` `DELETE` | `/categorias/{id}` | Busca · atualiza · exclui (só se estiver vazia) |
| `GET` | `/painel` | Totais, abaixo do mínimo, movimentos por dia, mais saídas e valor por categoria |

Tudo, exceto `saude`, `openapi.json` e `auth/*`, exige `Authorization: Bearer <token>`. A documentação completa, com exemplos e um playground para cada rota, está no console em `/#/docs`.

## Decisões de projeto
- **Dinheiro em centavos inteiros** (`preco_centavos: 5990` = R$ 59,90): sem erro de arredondamento de ponto flutuante.
- **O saldo só muda por movimentação.** `estoque` no produto é o saldo atual; o histórico que o explica fica em `movimentacoes`. Saldo e histórico são gravados **na mesma transação** (`db.transaction`), e há um teste que confere que, para todo produto, o saldo é a soma dos deltas.
- **Saída acima do saldo → `409 estoque_insuficiente`**, sem gravar nada. Um teste dispara 20 saídas simultâneas contra 10 unidades e confere que exatamente 10 passam.
- **Ajuste é contagem de inventário**: você informa o saldo contado e a API calcula a diferença.
- **Erros sempre no mesmo formato**, com `codigo` estável e `mensagem` para pessoas; erros de validação (422) listam `campos`.
- **Segurança**: senhas com `scrypt` e sal; JWT HS256 com algoritmo fixado na verificação (recusa `alg: none` e tokens assinados com outro segredo); resposta igual para e-mail inexistente e senha errada; limite de tentativas nas rotas de autenticação; ordenação por lista de colunas permitidas e consultas parametrizadas (testes de injeção de SQL); `%` e `_` na busca tratados como texto; cabeçalhos de segurança e CSP no console; corpo limitado a 100 KB.
- **A documentação não envelhece**: o console lê `/api/v1/openapi.json`, e um teste confere que toda rota documentada existe e que todo `$ref` aponta para um schema real.

## Console (`public/`)
JavaScript puro (módulos ES), sem build e sem framework. Visual de terminal: grafite, **JetBrains Mono** e **Hanken Grotesk** (hospedadas no projeto) e verde-limão como acento. O token fica só na aba (`sessionStorage`), os filtros do painel ficam na URL, e o gráfico é SVG com os números em uma tabela ao lado. Respeita `prefers-reduced-motion` e tem foco visível, link para pular ao conteúdo e CSP sem `unsafe-inline`.

## Estrutura
```
src/app.js        monta o Express (rotas, CSP, erros)       src/validacao.js  schemas zod com mensagens em português
src/auth.js       hash de senha e JWT                        src/estoque.js    movimentação transacional
src/db.js         esquema SQLite                             src/openapi.js    especificação OpenAPI
src/rotas/*       auth, produtos, categorias, movimentações, painel
src/seed.js       dados de demonstração                      public/           console (início, docs e painel)
```

## Stack
Node.js 22 · Express 5 · better-sqlite3 · jsonwebtoken · zod

## Limitações
- SQLite num único arquivo e limite de tentativas em memória: serve a uma instância. Com várias, o contador do limite precisaria de um armazenamento compartilhado (ex.: Redis) e o banco, de um servidor próprio.
- Todo usuário autenticado enxerga todo o estoque (não há papéis nem vários estoques).
- Sem renovação de token (*refresh token*): depois de 2 horas, é preciso entrar de novo.
- Datas em UTC (por exemplo, "últimos 14 dias" do painel).
- A versão anterior do projeto (`/produtos`, sem login) foi substituída por esta; as rotas agora ficam em `/api/v1`.
