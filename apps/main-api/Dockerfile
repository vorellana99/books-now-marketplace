# syntax=docker/dockerfile:1
#
# Imagen de la API de LibroYa, genérica (sirve en cualquier plataforma que corra contenedores). Dos imágenes salen de aquí:
#
#   docker build -t libroya-api .                        # la API (etapa `runtime`, la última, por defecto)
#   docker build --target migrate -t libroya-migrate .   # las migraciones (`prisma migrate deploy`), aparte
#
# Las migraciones NO corren al arrancar la API: se ejecutan como un paso previo y único del despliegue
# (`docker run --rm --env-file … libroya-migrate`), para que varias instancias no migren a la vez. Ver el README.

# ── base: Node 24 con la misma versión de pnpm que genera pnpm-lock.yaml ───────────────────────────────────────────────
FROM node:24-slim AS base
RUN npm install --global pnpm@12.15.0
WORKDIR /app

# ── deps: todas las dependencias (las de desarrollo hacen falta para compilar y para el CLI de Prisma) ────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ── build: compila TypeScript a dist/ (el cliente de Prisma se genera antes, en `prebuild`) ──────────────────────────────
FROM deps AS build
COPY nest-cli.json tsconfig.json tsconfig.build.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
# `prisma generate` lee prisma.config.ts, que arma la URL de la base: aquí no se conecta, así que valen valores de relleno
# (solo viven en este comando; no quedan en ninguna capa de la imagen final)
RUN DB_HOST=build DB_USER=build DB_PASSWORD=build DB_NAME=build pnpm run build

# ── prod-deps: solo las dependencias de producción ──────────────────────────────────────────────────────────────────────
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# ── migrate: aplica las migraciones y nada más (necesita el CLI de Prisma, que es de desarrollo) ───────────────────────
FROM deps AS migrate
COPY prisma.config.ts ./
COPY prisma ./prisma
COPY src/platform/config/database-url.ts ./src/platform/config/database-url.ts
USER node
ENTRYPOINT ["pnpm", "exec", "prisma"]
CMD ["migrate", "deploy"]

# ── runtime: la API. Sin pnpm, sin pruebas, sin código fuente y sin root ────────────────────────────────────────────────
FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 3000
# La salud de la propia instancia (no toca la base): el balanceador usa /health/ready
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
