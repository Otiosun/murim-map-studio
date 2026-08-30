import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const config = readFileSync('supabase/config.toml', 'utf8');
const template = readFileSync('supabase/templates/magic-link.html', 'utf8');

describe('player auth local configuration', () => {
  it('is invite-only six-digit OTP with 600-second expiry', () => {
    expect(config).toContain('site_url = "http://127.0.0.1:3001"');
    expect(config).toContain('[auth.email]');
    expect(config).toContain('enable_signup = false');
    expect(config).toContain('max_frequency = "60s"');
    expect(config).toContain('otp_length = 6');
    expect(config).toContain('otp_expiry = 600');
    expect(template).toContain('{{ .Token }}');
    expect(template).not.toContain('{{ .ConfirmationURL }}');
  });
});
