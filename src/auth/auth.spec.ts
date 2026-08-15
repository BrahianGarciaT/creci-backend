import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '../users/users.entity';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

jest.mock('bcrypt');

const mockUser: User = {
  id: 'uuid-1',
  email: 'dev@example.com',
  password: 'hashed-password',
  role: UserRole.DEVELOPER,
  isActive: true,
  refreshToken: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Mocks tipados explícitamente como jest.Mock (en vez de jest.Mocked<T>): así
// TS ve propiedades planas de tipo función, sin el "this" implícito de un
// método de clase — evita falsos positivos de unbound-method al pasar estas
// referencias a expect(...).toHaveBeenCalledWith(...).
type MockedUsersService = Pick<
  Record<keyof UsersService, jest.Mock>,
  'findByEmail' | 'findById' | 'updateRefreshToken'
>;
type MockedJwtService = Pick<Record<keyof JwtService, jest.Mock>, 'signAsync'>;

const mockUsersService: MockedUsersService = {
  findByEmail: jest.fn(),
  findById: jest.fn(),
  updateRefreshToken: jest.fn(),
};

const mockJwtService: MockedJwtService = {
  signAsync: jest.fn(),
};

describe('AuthService', () => {
  let service: AuthService;
  let usersService: MockedUsersService;
  let jwtService: MockedJwtService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        {
          provide: ConfigService,
          useValue: { getOrThrow: jest.fn().mockReturnValue('mock-value') },
        },
      ],
    }).compile();

    service = module.get(AuthService);
    usersService = mockUsersService;
    jwtService = mockJwtService;
  });

  afterEach(() => jest.clearAllMocks());

  describe('login', () => {
    it('throws UnauthorizedException when user is not found', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      await expect(
        service.login({ email: 'x@x.com', password: 'password1' }),
      ).rejects.toThrow('Invalid credentials');
    });

    it('throws UnauthorizedException when password does not match', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      await expect(
        service.login({ email: mockUser.email, password: 'wrongpass' }),
      ).rejects.toThrow('Invalid credentials');
    });

    it('returns token pair on valid credentials', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);
      usersService.updateRefreshToken.mockResolvedValue(undefined);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-refresh');
      jwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      const result = await service.login({
        email: mockUser.email,
        password: 'correct1',
      });

      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
      expect(usersService.updateRefreshToken).toHaveBeenCalledWith(
        mockUser.id,
        'hashed-refresh',
      );
    });
  });

  describe('logout', () => {
    it('clears the stored refresh token', async () => {
      usersService.updateRefreshToken.mockResolvedValue(undefined);
      await service.logout('uuid-1');
      expect(usersService.updateRefreshToken).toHaveBeenCalledWith(
        'uuid-1',
        null,
      );
    });
  });

  describe('refresh', () => {
    it('generates and returns a new token pair', async () => {
      usersService.updateRefreshToken.mockResolvedValue(undefined);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-refresh-new');
      jwtService.signAsync
        .mockResolvedValueOnce('new-access')
        .mockResolvedValueOnce('new-refresh');

      const result = await service.refresh(mockUser);

      expect(result).toEqual({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      });
    });
  });
});
