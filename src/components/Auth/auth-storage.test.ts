import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('authentication client storage', () => {
  it('does not store authentication data in browser storage', () => {
    const sources = ['LoginForm.tsx', 'LogoutButton.tsx']
      .map((file) => readFileSync(join(__dirname, file), 'utf8'))
      .join('\n');
    expect(sources).not.toContain('localStorage');
    expect(sources).not.toContain('sessionStorage');
  });
});
