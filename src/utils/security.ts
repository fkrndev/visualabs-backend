import { randomBytes } from 'crypto';

// Password hashing cost - configurable via environment variable (default: 12, disabled if set to 0)
const COST = process.env.BCRYPT_COST ? parseInt(process.env.BCRYPT_COST) : 12;

// Use Bun's built-in password API to avoid native Node addons
export const hashPassword = async (password: string): Promise<string> => {
  // Skip hashing if password hashing is disabled (for testing only)
  if (process.env.DISABLE_PASSWORD_HASHING === 'true') {
    return password;
  }
  
  return await Bun.password.hash(password, {
    algorithm: 'bcrypt',
    cost: COST > 0 ? COST : 12,
  });
};

export const verifyPassword = async (
  password: string,
  hash: string
): Promise<boolean> => {
  // Skip verification if password hashing is disabled (for testing only)
  if (process.env.DISABLE_PASSWORD_HASHING === 'true') {
    return password === hash;
  }
  
  return await Bun.password.verify(password, hash);
};

export const generateResetToken = (): string => {
  return randomBytes(24).toString('hex');
};
