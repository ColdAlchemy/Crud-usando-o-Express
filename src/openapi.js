/**
 * Especificação OpenAPI 3.1 da API. É a fonte do console de documentação (/#/docs):
 * a página lê este JSON, então a documentação não fica desatualizada em relação ao código
 * (um teste confere que toda rota documentada existe).
 */

const ref = (nome) => ({ $ref: `#/components/schemas/${nome}` });
const json = (schema, exemplo) => ({ "application/json": { schema, ...(exemplo ? { example: exemplo } : {}) } });
const resposta = (descricao, schema, exemplo) => ({ description: descricao, ...(schema ? { content: json(schema, exemplo) } : {}) });
const erro = (descricao) => resposta(descricao, ref("Erro"));
const id = { name: "id", in: "path", required: true, description: "Identificador numérico.", schema: { type: "integer", minimum: 1 }, example: 1 };
const pagina = { name: "pagina", in: "query", description: "Página (começa em 1).", schema: { type: "integer", minimum: 1, default: 1 } };
const limite = { name: "limite", in: "query", description: "Itens por página (1 a 100).", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } };
const auth = [{ bearerAuth: [] }];
const e401 = erro("Token ausente, inválido ou expirado.");
const e422 = erro("Dados inválidos (veja `campos`).");

const exemploProduto = {
  id: 7, sku: "CAM-PRE-M", nome: "Camiseta preta M", descricao: null, preco_centavos: 5990, estoque: 12, estoque_minimo: 10,
  estoque_baixo: false, ativo: true, categoria: { id: 2, nome: "Vestuário" }, criado_em: "2026-10-01T12:00:00.000Z", atualizado_em: "2026-10-09T18:30:00.000Z",
};

export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "Estoque API",
    version: "1.0.0",
    description:
      "API REST de controle de estoque: produtos, categorias e movimentações (entrada, saída e ajuste), com autenticação JWT, " +
      "paginação, filtros e ordenação. Valores em dinheiro são **inteiros em centavos** (`preco_centavos: 5990` = R$ 59,90).",
  },
  servers: [{ url: "/", description: "Este servidor" }],
  tags: [
    { name: "Autenticação", description: "Crie uma conta e troque e-mail e senha por um token JWT." },
    { name: "Produtos", description: "Cadastro de produtos. O saldo (`estoque`) só muda por movimentação." },
    { name: "Movimentações", description: "Entradas, saídas e ajustes de inventário, com histórico." },
    { name: "Categorias", description: "Agrupam produtos." },
    { name: "Painel", description: "Números agregados para um painel de estoque." },
    { name: "Sistema", description: "Verificação de saúde." },
  ],
  paths: {
    "/api/v1/saude": {
      get: { operationId: "saude", tags: ["Sistema"], summary: "Verifica se a API está no ar", responses: { 200: resposta("API no ar.", ref("Saude"), { status: "ok", versao: "1.0.0", ambiente: "development" }) } },
    },
    "/api/v1/auth/registrar": {
      post: {
        operationId: "registrar", tags: ["Autenticação"], summary: "Cria uma conta",
        description: "Limite de 10 tentativas por minuto por IP.",
        requestBody: { required: true, content: json(ref("NovoUsuario"), { nome: "Ana Souza", email: "ana@exemplo.com", senha: "uma-senha-longa" }) },
        responses: { 201: resposta("Conta criada.", ref("UsuarioCriado")), 409: erro("E-mail já cadastrado."), 422: e422, 429: erro("Limite de tentativas excedido.") },
      },
    },
    "/api/v1/auth/entrar": {
      post: {
        operationId: "entrar", tags: ["Autenticação"], summary: "Entra e recebe um token JWT",
        description: "Use o `token` no cabeçalho `Authorization: Bearer <token>` das demais rotas.",
        requestBody: { required: true, content: json(ref("Credenciais"), { email: "ana@exemplo.com", senha: "uma-senha-longa" }) },
        responses: { 200: resposta("Token emitido.", ref("Token")), 401: erro("E-mail ou senha incorretos."), 422: e422, 429: erro("Limite de tentativas excedido.") },
      },
    },
    "/api/v1/auth/eu": {
      get: { operationId: "eu", tags: ["Autenticação"], summary: "Mostra o usuário do token", security: auth, responses: { 200: resposta("Usuário autenticado.", { type: "object", properties: { usuario: ref("Usuario") } }), 401: e401 } },
    },

    "/api/v1/produtos": {
      get: {
        operationId: "listarProdutos", tags: ["Produtos"], summary: "Lista produtos", security: auth,
        description: "Paginado. Combine filtros à vontade. `ordem` aceita o nome de uma coluna, com `-` na frente para decrescente.",
        parameters: [
          pagina, limite,
          { name: "q", in: "query", description: "Busca no nome, SKU e descrição.", schema: { type: "string", maxLength: 100 } },
          { name: "categoria_id", in: "query", schema: { type: "integer" } },
          { name: "ativo", in: "query", schema: { type: "boolean" } },
          { name: "estoque_baixo", in: "query", description: "`true`: só produtos ativos com saldo no mínimo ou abaixo.", schema: { type: "boolean" } },
          { name: "ordem", in: "query", description: "Coluna de ordenação.", schema: { type: "string", enum: ["id", "nome", "sku", "preco_centavos", "estoque", "criado_em", "-id", "-nome", "-sku", "-preco_centavos", "-estoque", "-criado_em"], default: "id" } },
        ],
        responses: { 200: resposta("Página de produtos.", { type: "object", properties: { dados: { type: "array", items: ref("Produto") }, meta: ref("Paginacao") } }), 401: e401, 422: e422 },
      },
      post: {
        operationId: "criarProduto", tags: ["Produtos"], summary: "Cadastra um produto", security: auth,
        description: "`estoque_inicial` (opcional) já registra uma entrada com o motivo “Estoque inicial”.",
        requestBody: { required: true, content: json(ref("NovoProduto"), { sku: "CAM-PRE-M", nome: "Camiseta preta M", preco_centavos: 5990, estoque_minimo: 10, estoque_inicial: 25, categoria_id: 1 }) },
        responses: { 201: resposta("Produto criado.", ref("Produto"), exemploProduto), 401: e401, 409: erro("SKU já em uso."), 422: e422 },
      },
    },
    "/api/v1/produtos/{id}": {
      parameters: [id],
      get: { operationId: "buscarProduto", tags: ["Produtos"], summary: "Busca um produto", security: auth, responses: { 200: resposta("O produto.", ref("Produto"), exemploProduto), 401: e401, 404: erro("Produto não encontrado.") } },
      patch: {
        operationId: "atualizarProduto", tags: ["Produtos"], summary: "Atualiza campos de um produto", security: auth,
        description: "Envie só os campos que mudam. O saldo não é editável aqui: use as movimentações.",
        requestBody: { required: true, content: json(ref("EdicaoProduto"), { preco_centavos: 6490 }) },
        responses: { 200: resposta("Produto atualizado.", ref("Produto")), 401: e401, 404: erro("Produto não encontrado."), 409: erro("SKU já em uso."), 422: e422 },
      },
      delete: {
        operationId: "excluirProduto", tags: ["Produtos"], summary: "Exclui um produto", security: auth,
        description: "Só é possível se o produto nunca teve movimentação. Caso contrário, desative-o com `PATCH {\"ativo\": false}`.",
        responses: { 204: { description: "Excluído." }, 401: e401, 404: erro("Produto não encontrado."), 409: erro("O produto tem histórico de movimentações.") },
      },
    },
    "/api/v1/produtos/{id}/movimentacoes": {
      parameters: [id],
      get: {
        operationId: "listarMovimentacoesDoProduto", tags: ["Movimentações"], summary: "Histórico de um produto", security: auth,
        parameters: [pagina, limite],
        responses: { 200: resposta("Página de movimentações, da mais recente para a mais antiga.", { type: "object", properties: { dados: { type: "array", items: ref("Movimentacao") }, meta: ref("Paginacao") } }), 401: e401, 404: erro("Produto não encontrado.") },
      },
      post: {
        operationId: "registrarMovimentacao", tags: ["Movimentações"], summary: "Registra entrada, saída ou ajuste", security: auth,
        description:
          "- `entrada`: soma `quantidade` ao saldo.\n- `saida`: subtrai; se o saldo ficaria negativo, devolve `409 estoque_insuficiente`.\n" +
          "- `ajuste`: `quantidade` é o saldo contado no inventário; o `delta` é a diferença.\n\nO saldo e o histórico são gravados na mesma transação.",
        requestBody: { required: true, content: json(ref("NovaMovimentacao"), { tipo: "saida", quantidade: 3, motivo: "Venda #1042" }) },
        responses: {
          201: resposta("Movimentação registrada e produto com o saldo novo.", { type: "object", properties: { movimentacao: ref("Movimentacao"), produto: ref("Produto") } }),
          401: e401, 404: erro("Produto não encontrado."), 409: erro("Saldo insuficiente ou produto inativo."), 422: e422,
        },
      },
    },
    "/api/v1/movimentacoes": {
      get: {
        operationId: "listarMovimentacoes", tags: ["Movimentações"], summary: "Histórico geral", security: auth,
        parameters: [
          pagina, limite,
          { name: "produto_id", in: "query", schema: { type: "integer" } },
          { name: "tipo", in: "query", schema: { type: "string", enum: ["entrada", "saida", "ajuste"] } },
          { name: "de", in: "query", description: "Data inicial (AAAA-MM-DD, UTC).", schema: { type: "string", format: "date" } },
          { name: "ate", in: "query", description: "Data final, inclusive (AAAA-MM-DD, UTC).", schema: { type: "string", format: "date" } },
        ],
        responses: { 200: resposta("Página de movimentações com o produto de cada uma.", { type: "object", properties: { dados: { type: "array", items: ref("Movimentacao") }, meta: ref("Paginacao") } }), 401: e401, 422: e422 },
      },
    },

    "/api/v1/categorias": {
      get: { operationId: "listarCategorias", tags: ["Categorias"], summary: "Lista categorias", security: auth, parameters: [pagina, limite], responses: { 200: resposta("Página de categorias.", { type: "object", properties: { dados: { type: "array", items: ref("Categoria") }, meta: ref("Paginacao") } }), 401: e401 } },
      post: {
        operationId: "criarCategoria", tags: ["Categorias"], summary: "Cria uma categoria", security: auth,
        requestBody: { required: true, content: json(ref("NovaCategoria"), { nome: "Vestuário", descricao: "Roupas e acessórios" }) },
        responses: { 201: resposta("Categoria criada.", ref("Categoria")), 401: e401, 409: erro("Nome já em uso."), 422: e422 },
      },
    },
    "/api/v1/categorias/{id}": {
      parameters: [id],
      get: { operationId: "buscarCategoria", tags: ["Categorias"], summary: "Busca uma categoria", security: auth, responses: { 200: resposta("A categoria.", ref("Categoria")), 401: e401, 404: erro("Categoria não encontrada.") } },
      patch: {
        operationId: "atualizarCategoria", tags: ["Categorias"], summary: "Atualiza uma categoria", security: auth,
        requestBody: { required: true, content: json(ref("NovaCategoria"), { descricao: "Roupas, calçados e acessórios" }) },
        responses: { 200: resposta("Categoria atualizada.", ref("Categoria")), 401: e401, 404: erro("Categoria não encontrada."), 409: erro("Nome já em uso."), 422: e422 },
      },
      delete: { operationId: "excluirCategoria", tags: ["Categorias"], summary: "Exclui uma categoria", security: auth, responses: { 204: { description: "Excluída." }, 401: e401, 404: erro("Categoria não encontrada."), 409: erro("Há produtos na categoria.") } },
    },

    "/api/v1/painel": {
      get: {
        operationId: "painel", tags: ["Painel"], summary: "Números do painel de estoque", security: auth,
        description: "Totais, produtos abaixo do mínimo, entradas e saídas dos últimos 14 dias, produtos com mais saídas em 30 dias e valor por categoria.",
        responses: { 200: resposta("Indicadores.", ref("Painel")), 401: e401 },
      },
    },
  },
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
    schemas: {
      Erro: {
        type: "object", description: "Formato de todos os erros.",
        properties: {
          erro: {
            type: "object",
            properties: {
              codigo: { type: "string", description: "Código estável para o seu código tratar.", example: "validacao" },
              mensagem: { type: "string", description: "Texto para pessoas." },
              campos: { type: "array", description: "Só em 422.", items: { type: "object", properties: { campo: { type: "string" }, mensagem: { type: "string" } } } },
            },
            required: ["codigo", "mensagem"],
          },
        },
      },
      Paginacao: { type: "object", properties: { pagina: { type: "integer" }, limite: { type: "integer" }, total: { type: "integer" }, total_paginas: { type: "integer" } } },
      Saude: { type: "object", properties: { status: { type: "string" }, versao: { type: "string" }, ambiente: { type: "string" } } },
      NovoUsuario: { type: "object", required: ["nome", "email", "senha"], properties: { nome: { type: "string", minLength: 2, maxLength: 80 }, email: { type: "string", format: "email" }, senha: { type: "string", minLength: 8, maxLength: 72 } } },
      Credenciais: { type: "object", required: ["email", "senha"], properties: { email: { type: "string", format: "email" }, senha: { type: "string" } } },
      Usuario: { type: "object", properties: { id: { type: "integer" }, nome: { type: "string" }, email: { type: "string" } } },
      UsuarioCriado: { type: "object", properties: { usuario: ref("Usuario") } },
      Token: { type: "object", properties: { token: { type: "string", description: "JWT assinado (HS256)." }, tipo: { type: "string", example: "Bearer" }, expira_em_segundos: { type: "integer", example: 7200 }, usuario: ref("Usuario") } },
      Categoria: { type: "object", properties: { id: { type: "integer" }, nome: { type: "string" }, descricao: { type: ["string", "null"] }, total_produtos: { type: "integer" }, criado_em: { type: "string", format: "date-time" } } },
      NovaCategoria: { type: "object", required: ["nome"], properties: { nome: { type: "string", minLength: 2, maxLength: 60 }, descricao: { type: ["string", "null"], maxLength: 200 } } },
      Produto: {
        type: "object",
        properties: {
          id: { type: "integer" }, sku: { type: "string" }, nome: { type: "string" }, descricao: { type: ["string", "null"] },
          preco_centavos: { type: "integer", description: "Preço em centavos." }, estoque: { type: "integer", description: "Saldo atual (só muda por movimentação)." },
          estoque_minimo: { type: "integer" }, estoque_baixo: { type: "boolean", description: "Ativo e com saldo no mínimo ou abaixo." }, ativo: { type: "boolean" },
          categoria: { type: ["object", "null"], properties: { id: { type: "integer" }, nome: { type: "string" } } },
          criado_em: { type: "string", format: "date-time" }, atualizado_em: { type: "string", format: "date-time" },
        },
      },
      NovoProduto: {
        type: "object", required: ["sku", "nome", "preco_centavos"],
        properties: {
          sku: { type: "string", pattern: "^[A-Za-z0-9._-]{2,40}$", description: "Único, sem diferenciar maiúsculas." }, nome: { type: "string", minLength: 2, maxLength: 120 },
          descricao: { type: ["string", "null"], maxLength: 500 }, preco_centavos: { type: "integer", minimum: 0 }, estoque_minimo: { type: "integer", minimum: 0, default: 0 },
          ativo: { type: "boolean", default: true }, categoria_id: { type: ["integer", "null"] }, estoque_inicial: { type: "integer", minimum: 0, default: 0, description: "Registra uma entrada “Estoque inicial”." },
        },
      },
      EdicaoProduto: {
        type: "object", minProperties: 1,
        properties: {
          sku: { type: "string" }, nome: { type: "string" }, descricao: { type: ["string", "null"] }, preco_centavos: { type: "integer", minimum: 0 },
          estoque_minimo: { type: "integer", minimum: 0 }, ativo: { type: "boolean" }, categoria_id: { type: ["integer", "null"] },
        },
      },
      NovaMovimentacao: {
        type: "object", required: ["tipo", "quantidade"],
        properties: {
          tipo: { type: "string", enum: ["entrada", "saida", "ajuste"] },
          quantidade: { type: "integer", minimum: 0, description: "Entrada e saída: maior que zero. Ajuste: o saldo contado." },
          motivo: { type: "string", maxLength: 200 },
        },
      },
      Movimentacao: {
        type: "object",
        properties: {
          id: { type: "integer" }, produto_id: { type: "integer" }, tipo: { type: "string", enum: ["entrada", "saida", "ajuste"] }, quantidade: { type: "integer" },
          delta: { type: "integer", description: "Variação do saldo (negativa em saída)." }, saldo_apos: { type: "integer" }, motivo: { type: ["string", "null"] },
          usuario_id: { type: ["integer", "null"] }, criado_em: { type: "string", format: "date-time" },
        },
      },
      Painel: {
        type: "object",
        properties: {
          totais: { type: "object", properties: { produtos_ativos: { type: "integer" }, unidades: { type: "integer" }, valor_centavos: { type: "integer" }, sem_estoque: { type: "integer" }, abaixo_do_minimo: { type: "integer" } } },
          abaixo_do_minimo: { type: "array", items: { type: "object", properties: { id: { type: "integer" }, sku: { type: "string" }, nome: { type: "string" }, estoque: { type: "integer" }, estoque_minimo: { type: "integer" }, falta: { type: "integer" } } } },
          movimentos_por_dia: { type: "array", items: { type: "object", properties: { dia: { type: "string", format: "date" }, entradas: { type: "integer" }, saidas: { type: "integer" } } } },
          mais_saidas: { type: "object", properties: { dias: { type: "integer" }, itens: { type: "array", items: { type: "object", properties: { id: { type: "integer" }, sku: { type: "string" }, nome: { type: "string" }, quantidade: { type: "integer" } } } } } },
          por_categoria: { type: "array", items: { type: "object", properties: { categoria_id: { type: ["integer", "null"] }, categoria: { type: "string" }, produtos: { type: "integer" }, unidades: { type: "integer" }, valor_centavos: { type: "integer" } } } },
        },
      },
    },
  },
};
