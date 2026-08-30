'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { LoginActionState } from '../../lib/auth/otp';
import { requestPlayerOtp, verifyPlayerOtp } from '../../lib/auth/otp';
import { createPlayerSupabaseServerClient } from '../../lib/supabase/server';

export async function requestOtp(
  _previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const supabase = await createPlayerSupabaseServerClient();
  return requestPlayerOtp(supabase, formData.get('email'));
}

export async function verifyOtp(
  _previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const supabase = await createPlayerSupabaseServerClient();
  const result = await verifyPlayerOtp(supabase, formData.get('email'), formData.get('otp'));

  if (result.verified) {
    revalidatePath('/', 'layout');
    redirect('/');
  }

  return result.state;
}
