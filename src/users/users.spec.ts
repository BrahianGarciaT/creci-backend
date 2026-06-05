import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from './users.entity';
import { UsersService } from './users.service';

const mockUser: Partial<User> = { id: 'uuid-1', email: 'dev@example.com' };

const mockRepository = {
  findOne: jest.fn(),
  update: jest.fn(),
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockRepository },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findByEmail', () => {
    it('returns user when found', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser as User);
      const result = await service.findByEmail('dev@example.com');
      expect(result).toEqual(mockUser);
      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { email: 'dev@example.com' } });
    });

    it('returns null when not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      expect(await service.findByEmail('nope@example.com')).toBeNull();
    });
  });

  describe('findById', () => {
    it('returns user when found', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser as User);
      const result = await service.findById('uuid-1');
      expect(result).toEqual(mockUser);
      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { id: 'uuid-1' } });
    });

    it('returns null when not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      expect(await service.findById('nonexistent')).toBeNull();
    });
  });

  describe('updateRefreshToken', () => {
    it('calls update with the given values', async () => {
      mockRepository.update.mockResolvedValue({ affected: 1 });
      await service.updateRefreshToken('uuid-1', 'hashed-token');
      expect(mockRepository.update).toHaveBeenCalledWith('uuid-1', { refreshToken: 'hashed-token' });
    });

    it('clears the token when null is passed', async () => {
      mockRepository.update.mockResolvedValue({ affected: 1 });
      await service.updateRefreshToken('uuid-1', null);
      expect(mockRepository.update).toHaveBeenCalledWith('uuid-1', { refreshToken: null });
    });
  });
});
