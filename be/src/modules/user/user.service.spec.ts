import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';
import { EUserRole } from '../../database/entities';

const mockUserModel = {
  findOne: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  find: jest.fn(),
  countDocuments: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

// We spy on BaseService methods directly on the service instance
describe('UserService', () => {
  let service: UserService;

  const existingUser = {
    _id: 'user-id-123',
    address: 'bc1qexisting',
    roles: [EUserRole.BORROWER],
    isWhitelistedLender: false,
  };

  const newUser = {
    _id: 'user-id-new',
    address: 'bc1qnewaddress',
    roles: [EUserRole.BORROWER],
    isWhitelistedLender: false,
  };

  beforeEach(async () => {
    // UserService only injects its own model — mock it via the provider token
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: 'UserModel', // Mongoose model token is handled via InjectModel
          useValue: mockUserModel,
        },
      ],
    })
      .overrideProvider(UserService)
      .useFactory({
        factory: () => {
          const svc = new UserService(mockUserModel as any);
          return svc;
        },
      })
      .compile();

    service = module.get<UserService>(UserService);
  });

  describe('findOrCreateByAddress', () => {
    it('should return existing user if found', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(existingUser as any);
      jest.spyOn(service, 'create');

      const result = await service.findOrCreateByAddress('bc1qexisting');
      expect(result).toEqual(existingUser);
      expect(service.create).not.toHaveBeenCalled();
    });

    it('should create and return new user if not found', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(null);
      jest.spyOn(service, 'create').mockResolvedValue(newUser as any);

      const result = await service.findOrCreateByAddress('bc1qnewaddress');
      expect(result).toEqual(newUser);
      expect(service.create).toHaveBeenCalledWith(
        expect.objectContaining({ address: 'bc1qnewaddress' }),
      );
    });

    it('should assign BORROWER role by default to new user', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(null);
      jest.spyOn(service, 'create').mockResolvedValue(newUser as any);

      await service.findOrCreateByAddress('bc1qnewaddress');
      expect(service.create).toHaveBeenCalledWith(
        expect.objectContaining({ roles: [EUserRole.BORROWER] }),
      );
    });
  });

  describe('isWhitelistedLender', () => {
    it('should return false for non-whitelisted user', async () => {
      jest
        .spyOn(service, 'findByIdOrThrow')
        .mockResolvedValue({ ...existingUser, isWhitelistedLender: false } as any);

      const result = await service.isWhitelistedLender('user-id-123');
      expect(result).toBe(false);
    });

    it('should return true after whitelisting', async () => {
      jest
        .spyOn(service, 'findByIdOrThrow')
        .mockResolvedValue({ ...existingUser, isWhitelistedLender: true } as any);

      const result = await service.isWhitelistedLender('user-id-123');
      expect(result).toBe(true);
    });
  });

  describe('whitelistLender', () => {
    it('should call findByIdAndUpdate with correct fields to whitelist a lender', async () => {
      const whitelistedUser = { ...existingUser, isWhitelistedLender: true, roles: [EUserRole.BORROWER, EUserRole.LENDER] };
      jest.spyOn(service, 'findByIdAndUpdate').mockResolvedValue(whitelistedUser as any);

      const result = await service.whitelistLender('user-id-123');

      expect(service.findByIdAndUpdate).toHaveBeenCalledWith('user-id-123', {
        $set: { isWhitelistedLender: true },
        $addToSet: { roles: EUserRole.LENDER },
      });
      expect(result.isWhitelistedLender).toBe(true);
    });
  });
});
