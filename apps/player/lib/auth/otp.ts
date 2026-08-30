export type LoginActionState =
  | { status: 'idle' }
  | { status: 'code-sent'; email: string; message: string }
  | { status: 'error'; email?: string; message: string };

export interface OtpAuthClient {
  auth: {
    signInWithOtp(input: {
      email: string;
      options: { shouldCreateUser: false };
    }): Promise<{ error: unknown | null }>;
    verifyOtp(input: {
      email: string;
      token: string;
      type: 'email';
    }): Promise<{ error: unknown | null }>;
  };
}

export interface OtpVerificationResult {
  verified: boolean;
  state: LoginActionState;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_PATTERN = /^\d{6}$/;
const CODE_SENT_MESSAGE = 'Se o endereço estiver autorizado, o código foi enviado.';

export function normalizeLoginEmail(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const email = value.trim().toLowerCase();
  if (!email || !EMAIL_PATTERN.test(email)) {
    return null;
  }

  return email;
}

export function parseEmailOtp(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const token = value.trim();
  return OTP_PATTERN.test(token) ? token : null;
}

export async function requestPlayerOtp(
  client: OtpAuthClient,
  emailValue: FormDataEntryValue | null,
): Promise<LoginActionState> {
  const email = normalizeLoginEmail(emailValue);
  if (!email) {
    return { status: 'error', message: 'E-mail inválido.' };
  }

  try {
    await client.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
  } catch {
    // Public copy intentionally stays identical to avoid account enumeration.
  }

  return {
    status: 'code-sent',
    email,
    message: CODE_SENT_MESSAGE,
  };
}

export async function verifyPlayerOtp(
  client: OtpAuthClient,
  emailValue: FormDataEntryValue | null,
  otpValue: FormDataEntryValue | null,
): Promise<OtpVerificationResult> {
  const email = normalizeLoginEmail(emailValue);
  if (!email) {
    return {
      verified: false,
      state: { status: 'error', message: 'E-mail inválido.' },
    };
  }

  const token = parseEmailOtp(otpValue);
  if (!token) {
    return {
      verified: false,
      state: { status: 'error', email, message: 'Código inválido.' },
    };
  }

  try {
    const { error } = await client.auth.verifyOtp({ email, token, type: 'email' });
    if (!error) {
      return { verified: true, state: { status: 'idle' } };
    }
  } catch {
    // Provider details do not cross the public action boundary.
  }

  return {
    verified: false,
    state: { status: 'error', email, message: 'Código inválido ou expirado.' },
  };
}
