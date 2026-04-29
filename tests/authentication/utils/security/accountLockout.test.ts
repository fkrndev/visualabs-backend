import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkLockout, recordFailedAttempt, recordSuccessfulAttempt } from '@/utils/security/accountLockout';

// Mock the database
vi.mock('@/db/client', () => ({
  db: {
    query: {
      accountLockoutEntries: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock the schema
vi.mock('@/db/schema', () => ({
  accountLockoutEntries: {},
}));

import { db } from '@/db/client';
import { accountLockoutEntries } from '@/db/schema';
import { eq } from 'drizzle-orm';

describe('checkLockout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return not locked when no entry exists', async () => {
    vi.mocked(db.query.accountLockoutEntries.findFirst).mockResolvedValue(null);
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnThis(),
    } as any);

    const result = await checkLockout('test@example.com');

    expect(result.isLocked).toBe(false);
    expect(result.remainingAttempts).toBe(5);
    expect(result.lockRemainingTime).toBe(0);
  });

  it('should create new entry when none exists', async () => {
    vi.mocked(db.query.accountLockoutEntries.findFirst).mockResolvedValue(null);
    const insertMock = vi.fn().mockReturnThis();
    vi.mocked(db.insert).mockReturnValue({
      values: insertMock,
    } as any);

    await checkLockout('test@example.com');

    expect(insertMock).toHaveBeenCalledWith({
      identifier: 'test@example.com',
      attempts: 0,
      lockUntil: null,
    });
  });

  it('should reset entry when lock has expired', async () => {
    const pastDate = new Date(Date.now() - 1000);
    vi.mocked(db.query.accountLockoutEntries.findFirst).mockResolvedValue({
      identifier: 'test@example.com',
      attempts: 5,
      lockUntil: pastDate,
      updatedAt: new Date(),
    });

    const updateMock = vi.fn().mockReturnThis();
    const whereMock = vi.fn().mockReturnThis();
    vi.mocked(db.update).mockReturnValue({
      set: updateMock,
      where: whereMock,
    } as any);

    const result = await checkLockout('test@example.com');

    expect(result.isLocked).toBe(false);
    expect(result.remainingAttempts).toBe(5);
  });

  it('should return locked when account is currently locked', async () => {
    const futureDate = new Date(Date.now() + 60000);
    vi.mocked(db.query.accountLockoutEntries.findFirst).mockResolvedValue({
      identifier: 'test@example.com',
      attempts: 5,
      lockUntil: futureDate,
      updatedAt: new Date(),
    });

    const result = await checkLockout('test@example.com');

    expect(result.isLocked).toBe(true);
    expect(result.remainingAttempts).toBe(0);
    expect(result.lockRemainingTime).toBeGreaterThan(0);
  });

  it('should return remaining attempts when not locked', async () => {
    vi.mocked(db.query.accountLockoutEntries.findFirst).mockResolvedValue({
      identifier: 'test@example.com',
      attempts: 2,
      lockUntil: null,
      updatedAt: new Date(),
    });

    const result = await checkLockout('test@example.com');

    expect(result.isLocked).toBe(false);
    expect(result.remainingAttempts).toBe(3);
  });

  it('should fail-open on database error', async () => {
    vi.mocked(db.query.accountLockoutEntries.findFirst).mockRejectedValue(new Error('DB error'));

    const result = await checkLockout('test@example.com');

    expect(result.isLocked).toBe(false);
    expect(result.remainingAttempts).toBe(5);
  });
});

describe('recordFailedAttempt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create new entry with 1 attempt', async () => {
    vi.mocked(db.query.accountLockoutEntries.findFirst).mockResolvedValue(null);
    const insertMock = vi.fn().mockReturnThis();
    vi.mocked(db.insert).mockReturnValue({
      values: insertMock,
    } as any);

    const result = await recordFailedAttempt('test@example.com');

    expect(result.isLocked).toBe(false);
    expect(result.remainingAttempts).toBe(4);
    expect(insertMock).toHaveBeenCalledWith({
      identifier: 'test@example.com',
      attempts: 1,
      lockUntil: null,
    });
  });

  it('should increment attempts', async () => {
    vi.mocked(db.query.accountLockoutEntries.findFirst).mockResolvedValue({
      identifier: 'test@example.com',
      attempts: 2,
      lockUntil: null,
      updatedAt: new Date(),
    });

    const updateMock = vi.fn().mockReturnThis();
    const whereMock = vi.fn().mockReturnThis();
    vi.mocked(db.update).mockReturnValue({
      set: updateMock,
      where: whereMock,
    } as any);

    const result = await recordFailedAttempt('test@example.com');

    expect(result.isLocked).toBe(false);
    expect(result.remainingAttempts).toBe(2);
  });

  it('should lock account when max attempts reached', async () => {
    vi.mocked(db.query.accountLockoutEntries.findFirst).mockResolvedValue({
      identifier: 'test@example.com',
      attempts: 4,
      lockUntil: null,
      updatedAt: new Date(),
    });

    const updateMock = vi.fn().mockReturnThis();
    const whereMock = vi.fn().mockReturnThis();
    vi.mocked(db.update).mockReturnValue({
      set: updateMock,
      where: whereMock,
    } as any);

    const result = await recordFailedAttempt('test@example.com');

    expect(result.isLocked).toBe(true);
    expect(result.remainingAttempts).toBe(0);
    expect(result.lockRemainingTime).toBe(15 * 60 * 1000);
  });

  it('should fail-open on database error', async () => {
    vi.mocked(db.query.accountLockoutEntries.findFirst).mockRejectedValue(new Error('DB error'));

    const result = await recordFailedAttempt('test@example.com');

    expect(result.isLocked).toBe(false);
    expect(result.remainingAttempts).toBe(4);
  });
});

describe('recordSuccessfulAttempt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reset attempts when entry exists', async () => {
    vi.mocked(db.query.accountLockoutEntries.findFirst).mockResolvedValue({
      identifier: 'test@example.com',
      attempts: 3,
      lockUntil: null,
      updatedAt: new Date(),
    });

    const updateMock = vi.fn().mockReturnThis();
    const whereMock = vi.fn().mockReturnThis();
    vi.mocked(db.update).mockReturnValue({
      set: updateMock,
      where: whereMock,
    } as any);

    await recordSuccessfulAttempt('test@example.com');

    expect(updateMock).toHaveBeenCalledWith({
      attempts: 0,
      lockUntil: null,
      updatedAt: expect.any(Date),
    });
  });

  it('should do nothing when entry does not exist', async () => {
    vi.mocked(db.query.accountLockoutEntries.findFirst).mockResolvedValue(null);

    await recordSuccessfulAttempt('test@example.com');

    expect(db.update).not.toHaveBeenCalled();
  });

  it('should handle database error gracefully', async () => {
    vi.mocked(db.query.accountLockoutEntries.findFirst).mockRejectedValue(new Error('DB error'));

    await expect(recordSuccessfulAttempt('test@example.com')).resolves.not.toThrow();
  });
});
