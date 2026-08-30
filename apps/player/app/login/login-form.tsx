'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import type { LoginActionState } from '../../lib/auth/otp';
import { requestOtp, verifyOtp } from './actions';

const initialState: LoginActionState = { status: 'idle' };

function CodeForm({ email, requestMessage }: { email: string; requestMessage: string }) {
  const seed: LoginActionState = { status: 'code-sent', email, message: requestMessage };
  const [verifyState, verifyAction, isVerifying] = useActionState(verifyOtp, seed);
  const [resendState, resendAction, isResending] = useActionState(requestOtp, seed);

  let message: string | null = requestMessage;
  if (verifyState.status === 'error') {
    message = verifyState.message;
  } else if (resendState.status === 'code-sent' || resendState.status === 'error') {
    message = resendState.message;
  }

  return (
    <div className="login-stack">
      <p className="login-note">{message}</p>
      <form action={verifyAction} className="login-form">
        <input type="hidden" name="email" value={email} />
        <label htmlFor="otp">Código de 6 dígitos</label>
        <input
          id="otp"
          name="otp"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
        />
        <button type="submit" disabled={isVerifying}>
          {isVerifying ? 'Verificando…' : 'Entrar'}
        </button>
      </form>

      <form action={resendAction} className="login-secondary-form">
        <input type="hidden" name="email" value={email} />
        <button type="submit" className="button-secondary" disabled={isResending}>
          {isResending ? 'Reenviando…' : 'Reenviar código'}
        </button>
      </form>

      <Link href="/login" className="login-link">
        Usar outro e-mail
      </Link>
    </div>
  );
}

export function LoginForm() {
  const [state, action, isPending] = useActionState(requestOtp, initialState);

  if (state.status === 'code-sent') {
    return <CodeForm email={state.email} requestMessage={state.message} />;
  }

  return (
    <form action={action} className="login-form">
      <label htmlFor="email">E-mail autorizado</label>
      <input id="email" name="email" type="email" autoComplete="email" required />
      <button type="submit" disabled={isPending}>
        {isPending ? 'Enviando…' : 'Enviar código'}
      </button>
      {state.status === 'error' ? <p className="login-message">{state.message}</p> : null}
    </form>
  );
}
