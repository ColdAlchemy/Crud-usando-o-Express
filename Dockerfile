# Etapa 1: instala as dependências (o better-sqlite3 pode precisar compilar no Alpine).
FROM node:22-alpine AS dependencias
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Etapa 2: imagem final, só com o necessário e sem rodar como root.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DB_FILE=/data/estoque.db
COPY --from=dependencias /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY public ./public
RUN mkdir -p /data && chown -R node:node /data
VOLUME /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -qO- http://127.0.0.1:3000/api/v1/saude || exit 1
CMD ["node", "src/server.js"]
