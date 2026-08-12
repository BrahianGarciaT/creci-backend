import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { App } from 'supertest/types';
import { RolesGuard } from '../auth/roles.guard';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserResponseDto } from './dto/user-response.dto';
import { User, UserRole } from './users.entity';

/**
 * Integración liviana (no e2e — reusa el mismo runner @swc/jest que ya
 * funciona en el proyecto; la infra de e2e con ts-jest está rota/sin
 * instalar). Ejercita el ValidationPipe y el RolesGuard REALES —a
 * diferencia de users.controller.spec.ts, que los mockea— para cubrir dos
 * escenarios de la spec que sdd-verify marcó como no probados en runtime:
 * el whitelist estricto del body y el 403 por rol insuficiente.
 *
 * La autenticación JWT real (JwtAuthGuard, global vía APP_GUARD en
 * AppModule) no se replica acá: se reemplaza por un guard de prueba que
 * inyecta request.user desde un header, ya que probar el JWT en sí no es
 * parte de los escenarios de esta spec.
 */
function makeResponseDto(overrides: Partial<UserResponseDto> = {}): UserResponseDto {
  const dto = new UserResponseDto();
  dto.id = 'uuid-1';
  dto.email = 'dev@example.com';
  dto.role = UserRole.DEVELOPER;
  dto.isActive = true;
  dto.createdAt = new Date('2024-01-01');
  dto.updatedAt = new Date('2024-01-01');
  return Object.assign(dto, overrides);
}

// Guard de prueba: simula la autenticación leyendo el rol de un header,
// dejando que RolesGuard (real) sea quien realmente decide 403 sí/no.
class FakeAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const role = req.headers['x-test-role'] as UserRole | undefined;
    if (role) {
      req.user = { id: 'actor-uuid', role } as User;
    }
    return true;
  }
}

describe('UsersController (integración — ValidationPipe y RolesGuard reales)', () => {
  let app: INestApplication<App>;
  const mockUsersService = {
    update: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: mockUsersService },
        RolesGuard,
        { provide: APP_GUARD, useClass: FakeAuthGuard },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterEach(() => jest.clearAllMocks());

  afterAll(async () => {
    await app.close();
  });

  describe('Requisito: acceso solo ADMIN', () => {
    it('devuelve 403 cuando el actor autenticado no es admin', async () => {
      await request(app.getHttpServer())
        .patch('/users/uuid-1')
        .set('x-test-role', UserRole.DEVELOPER)
        .send({ role: UserRole.ADMIN })
        .expect(403);

      expect(mockUsersService.update).not.toHaveBeenCalled();
    });

    it('permite el acceso cuando el actor autenticado es admin', async () => {
      mockUsersService.update.mockResolvedValue(makeResponseDto({ role: UserRole.ADMIN }));

      await request(app.getHttpServer())
        .patch('/users/uuid-1')
        .set('x-test-role', UserRole.ADMIN)
        .send({ role: UserRole.ADMIN })
        .expect(200);

      expect(mockUsersService.update).toHaveBeenCalledWith('uuid-1', { role: UserRole.ADMIN });
    });
  });

  describe('Requisito: email es inmutable (rechazado por el ValidationPipe real)', () => {
    it('devuelve 400 si el body incluye email, y nunca llega al servicio', async () => {
      await request(app.getHttpServer())
        .patch('/users/uuid-1')
        .set('x-test-role', UserRole.ADMIN)
        .send({ role: UserRole.ADMIN, email: 'nuevo@example.com' })
        .expect(400);

      expect(mockUsersService.update).not.toHaveBeenCalled();
    });
  });
});
