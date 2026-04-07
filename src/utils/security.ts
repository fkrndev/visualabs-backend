import { randomBytes } from 'crypto';

const COST = 12;

// Use Bun's built-in password API to avoid native Node addons
export const hashPassword = async (password: string): Promise<string> => {
  return await Bun.password.hash(password, {
    algorithm: 'bcrypt',
    cost: COST,
  });
};

export const verifyPassword = async (
  password: string,
  hash: string
): Promise<boolean> => {
  return await Bun.password.verify(password, hash);
};

export const generateResetToken = (): string => {
  return randomBytes(24).toString('hex');
};
