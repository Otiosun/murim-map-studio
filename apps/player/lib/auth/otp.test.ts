import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error RED: OTP helpers are intentionally absent before Task 4 implementation.
import {
  normalizeLoginEmail,
  parseEmailOtp,
  requestPlayerOtp,
  verifyPlayerOtp,
} from './otp';

describe('player OTP auth helpers', () => {
  it('normalizes valid email and rejects invalid input', () => {
    expect(normalizeLoginEmail('  Player@Example.COM  ')).toBe('player@example.com');
    expect(normalizeLoginEmail('invalid-email')).toBeNull();
    expect(normalizeLoginEmail('player@')).toBeNull();
    expect(normalizeLoginEmail(null)).toBeNull();
  });

  it('accepts only an exact six-digit OTP', () => {
    expect(parseEmailOtp('123456')).toBe('123456');
    expect(parseEmailOtp(' 123456 ')).toBe('123456');
    expect(parseEmailOtp('12345')).toBeNull();
    expect(parseEmailOtp('1234567')).toBeNull();
    expect(parseEmailOtp('12a456')).toBeNull();
    expect(parseEmailOtp(null)).toBeNull();
  });

  it('always disables user creation when requesting an OTP', async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
    const client = { auth: { signInWithOtp, verifyOtp: vi.fn() } };

    const result = await requestPlayerOtp(client, 'PLAYER@example.com');

    expect(signInWithOtp).toHaveBeenCalledExactlyOnceWith({
      email: 'player@example.com',
      options: { shouldCreateUser: false },
    });
    expect(result).toEqual({
      status: 'code-sent',
      email: 'player@example.com',
      message: 'Se o endereço estiver autorizado, o código foi enviado.',
    });
  });

  it('uses the same public response when the provider reports an account-related error', async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ error: { message: 'Signups not allowed' } });
    const client = { auth: { signInWithOtp, verifyOtp: vi.fn() } };

    const result = await requestPlayerOtp(client, 'player@example.com');

    expect(result).toEqual({
      status: 'code-sent',
      email: 'player@example.com',
      message: 'Se o endereço estiver autorizado, o código foi enviado.',
    });
  });

  it('rejects malformed OTP before calling the provider', async () => {
    const verifyOtp = vi.fn();
    const client = { auth: { signInWithOtp: vi.fn(), verifyOtp } };

    const result = await verifyPlayerOtp(client, 'player@example.com', '12345x');

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(result).toEqual({
      verified: false,
      state: {
        status: 'error',
        email: 'player@example.com',
        message: 'Código inválido.',
      },
    });
  });
});
