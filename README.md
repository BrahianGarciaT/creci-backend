# Creci App — Backend

API REST para la gestión de proyectos y tareas de Creci App: autenticación de usuarios, proyectos, tareas y un dashboard con métricas.

## Stack

- [NestJS](https://nestjs.com/) 11 (TypeScript) sobre Express
- PostgreSQL 16 + TypeORM
- Autenticación JWT (access + refresh token)
- pnpm como gestor de paquetes
- Jest para tests unitarios y e2e

## Requisitos previos

- Node.js 20+
- pnpm 11 (`corepack enable` si no lo tenés instalado)
- Docker (para levantar Postgres) o una instancia propia de PostgreSQL

## Puesta en marcha

1. Instalar dependencias:

   ```bash
   pnpm install
   ```

2. Copiar las variables de entorno de ejemplo y completarlas:

   ```bash
   cp .env.example .env
   ```

   Variables principales:

   | Variable | Descripción |
   |---|---|
   | `PORT` | Puerto donde corre la API (default `3000`) |
   | `NODE_ENV` | Entorno de ejecución |
   | `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Conexión a PostgreSQL |
   | `JWT_SECRET`, `JWT_EXPIRES_IN` | Firma y expiración del access token |
   | `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN` | Firma y expiración del refresh token |

3. Levantar la base de datos con Docker:

   ```bash
   docker compose up -d
   ```

4. Correr la API en modo desarrollo (con watch):

   ```bash
   pnpm start:dev
   ```

   La API queda disponible en `http://localhost:3000`. El esquema se sincroniza automáticamente contra la base (`synchronize: true`), no hay migraciones ni seeds.

## Scripts disponibles

| Script | Descripción |
|---|---|
| `pnpm start` | Levanta la API sin watch |
| `pnpm start:dev` | Levanta la API en modo desarrollo con watch |
| `pnpm start:debug` | Levanta la API en modo debug con watch |
| `pnpm build` | Compila el proyecto (`nest build`) |
| `pnpm start:prod` | Corre la build compilada (`node dist/main`) |
| `pnpm lint` | Corre ESLint con autofix |
| `pnpm format` | Formatea el código con Prettier |
| `pnpm test` | Corre los tests unitarios |
| `pnpm test:watch` | Corre los tests unitarios en modo watch |
| `pnpm test:cov` | Corre los tests con reporte de cobertura |
| `pnpm test:e2e` | Corre los tests end-to-end |

## Estructura del proyecto

```
src/
├── auth/        # Login, registro, JWT guards y estrategias
├── config/       # Configuración y validación de variables de entorno
├── dashboard/    # Métricas y resumen para el dashboard
├── projects/     # CRUD de proyectos
├── tasks/        # CRUD de tareas
├── users/        # Gestión de usuarios y roles
└── main.ts       # Bootstrap de la aplicación
```

Cada módulo sigue la misma convención: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.entity.ts` y una carpeta `dto/` con los DTOs de entrada/salida.

## Autenticación

Toda la API requiere JWT por defecto (guard global `JwtAuthGuard`). Los endpoints que deben ser públicos se marcan explícitamente con el decorador `@Public()`. Existe además un guard de roles para restringir acciones a usuarios admin.

## Módulos / endpoints principales

- `auth` — login, registro, refresh de token
- `users` — gestión de usuarios
- `projects` — gestión de proyectos
- `tasks` — gestión de tareas
- `dashboard` — métricas agregadas

## CORS

El backend habilita CORS hacia la URL definida en `FRONTEND_URL` (default `http://localhost:4200`, el puerto del frontend Angular).
