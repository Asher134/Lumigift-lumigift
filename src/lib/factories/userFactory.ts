import { User } from '../../types';

/**
 * Generates a test User object.
 * @param overrides Partial fields to override the defaults.
 * @returns User
 */
export function createTestUser(overrides?: Partial<User>): User {
  const defaultUser: User = {
    id: `user-${Date.now()}`,
    phone: '+1234567890',
    displayName: 'Test User',
    email: 'test@example.com',
    avatarUrl: undefined,
    stellarPublicKey: undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return { ...defaultUser, ...overrides };
}
