import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const config = readFileSync('supabase/config.toml', 'utf8');
const template = readFileSync('supabase/templates/magic-link.html', 'utf8');

function section(name: string): string {
  const escapedName = name.replace('.', '\\.');
  const match = config.match(new RegExp(`\\[${escapedName}\\]([\\s\\S]*?)(?=\\n\\[|$)`));
  return match?.[1] ?? '';
}

describe('player auth local configuration', () => {
  it('is invite-only while keeping the email provider enabled for existing players', () => {
    const auth = section('auth');
    const email = section('auth.email');

    expect(auth).toContain('enable_signup = false');
    expect(email).toContain('enable_signup = true');
    expect(email).toContain('max_frequency = "60s"');
    expect(email).toContain('otp_length = 6');
    expect(email).toContain('otp_expiry = 600');
    expect(template).toContain('{{ .Token }}');
    expect(template).not.toContain('{{ .ConfirmationURL }}');
  });
});
