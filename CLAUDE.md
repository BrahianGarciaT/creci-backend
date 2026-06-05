# Project conventions — Backend (NestJS)

## Language
- All code (variables, functions, classes, files, folders) in **English**
- Comments and documentation directed at the development team in **Spanish**

## Code style
- Variables and functions: `camelCase`
- Classes, interfaces, DTOs, enums: `PascalCase`
- Files: `kebab-case` (e.g. `users.service.ts`, `create-user.dto.ts`)
- Constants: `UPPER_SNAKE_CASE`

## Module structure
Each feature follows this flat structure. Only `dto/` gets a subfolder:
```
src/
└── users/
    ├── users.module.ts
    ├── users.controller.ts
    ├── users.service.ts
    ├── users.entity.ts
    ├── users.spec.ts
    └── dto/
        ├── create-user.dto.ts
        └── update-user.dto.ts
```

## Error handling
- Use NestJS built-in exceptions (`NotFoundException`, `BadRequestException`, `UnauthorizedException`, etc.)
- Do not create custom exception classes unless a built-in equivalent does not exist
- Always throw exceptions from the service layer, never from the controller

## API responses
- Return data directly without a wrapper envelope
- Let HTTP status codes communicate the result
- Use NestJS default behavior (`@HttpCode`, `@Get`, `@Post`, etc.)

## Authentication
- JWT-based authentication using `@nestjs/jwt` and `@nestjs/passport`
- Access token + refresh token pattern
- Auth guard applied globally, with `@Public()` decorator to opt out
- Passwords hashed with `bcrypt`
- JWT secrets and expiration times via environment variables only

## Database
- Column and table names in `snake_case` (configured at DataSource level with naming strategy)
- Entity class names in `PascalCase`
- Always define relations explicitly in entities using decorators (`@ManyToOne`, `@OneToMany`, etc.)
- Use decorators-based entities (`@Entity`, `@Column`, `@PrimaryGeneratedColumn`, etc.)
- Repository pattern via `@InjectRepository()`, never direct EntityManager
- Use migrations for all schema changes, never `synchronize: true` in production
- Never hardcode database credentials, always via environment variables

## Environment variables
- All configuration via `@nestjs/config`
- Never hardcode secrets, URLs, or credentials
- Validate env vars at startup with a validation schema

## Testing
- Framework: Jest with `@swc/jest` transformer
- One `.spec.ts` file per service and controller, colocated in the same feature folder
- Use NestJS `Test.createTestingModule()` for unit tests
- Mock dependencies explicitly, do not use real database in unit tests

## General rules
- Keep controllers thin: only handle HTTP concerns, delegate logic to services
- Services handle business logic only
- No business logic in entities or DTOs
- Always use async/await, never raw Promises with `.then()`
- Enable strict mode in TypeScript
