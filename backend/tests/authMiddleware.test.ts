import jwt from 'jsonwebtoken';
import { Response } from 'express';
import { authMiddleware, AuthRequest, generateToken } from '../src/middleware/auth';

const mockFindUser = jest.fn();
jest.mock('../src/index', () => ({
  prisma: { user: { findUnique: (...args: any[]) => mockFindUser(...args) } }
}));

const secret = process.env.JWT_SECRET || 'super-secret-key-change-in-production';
const user = {
  id: 'user-1', email: 'test@example.invalid', organizationId: 'org-1',
  role: 'member', isActive: true
};
const sign = (payload: object = { userId: user.id }) => jwt.sign(payload, secret);

describe('authMiddleware', () => {
  let req: AuthRequest;
  let res: Response;
  let next: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFindUser.mockReset().mockResolvedValue(user);
    req = { headers: {} } as AuthRequest;
    res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() } as any;
    next = jest.fn();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['missing header', undefined],
    ['missing token', 'Bearer'],
    ['wrong scheme', `Basic ${sign()}`],
    ['extra fields', `Bearer ${sign()} extra`],
    ['malformed token', 'Bearer invalid'],
    ['invalid signature', `Bearer ${jwt.sign({ userId: user.id }, 'different-secret')}`],
    ['expired token', `Bearer ${jwt.sign({ userId: user.id }, secret, { expiresIn: -60 })}`],
    ['missing user ID', `Bearer ${sign({ role: 'owner' })}`],
    ['non-string user ID', `Bearer ${sign({ userId: 123 })}`],
    ['empty user ID', `Bearer ${sign({ userId: '' })}`]
  ])('rejects %s before querying the database', async (_label, header) => {
    req.headers.authorization = header;
    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(mockFindUser).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it.each([null, { ...user, isActive: false }])('rejects missing/inactive users', async record => {
    mockFindUser.mockResolvedValue(record);
    req.headers.authorization = `Bearer ${sign()}`;
    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it.each(['Bearer', 'bearer', 'BEARER'])('accepts %s and uses database identity', async scheme => {
    req.headers.authorization = `${scheme} ${sign({
      userId: user.id, organizationId: 'forged-org', role: 'owner', email: 'wrong@example.invalid'
    })}`;
    await authMiddleware(req, res, next);
    expect(mockFindUser).toHaveBeenCalledWith({ where: { id: user.id } });
    expect(req.user).toEqual({
      id: user.id, email: user.email, organizationId: user.organizationId, role: user.role
    });
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('accepts tokens issued by the application', async () => {
    req.headers.authorization = `Bearer ${generateToken(user.id, user.email, user.organizationId, user.role)}`;
    await authMiddleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user?.id).toBe(user.id);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 500 on database failure without continuing', async () => {
    mockFindUser.mockRejectedValue(new Error('database unavailable'));
    req.headers.authorization = `Bearer ${sign()}`;
    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication error' });
    expect(next).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });
});
