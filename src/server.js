import { criarApp } from "./app.js";

const porta = process.env.PORT ?? 3000;
criarApp(process.env.DB_FILE ?? "produtos.db").listen(porta, () => console.log(`API em http://localhost:${porta}`));
