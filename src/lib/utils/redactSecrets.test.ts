import { redactSecrets } from './redactSecrets';

describe('redactSecrets', () => {
  test('should redact Authorization Bearer tokens', () => {
    const input = 'Authorization: Bearer sk-1234567890abcdef';
    const result = redactSecrets(input);
    expect(result).toBe('Authorization: Bearer [REDACTED]');
  });

  test('should redact JSON API keys', () => {
    const input = '{"apiKey": "secret123", "token": "abc123"}';
    const result = redactSecrets(input);
    expect(result).toBe('{"apiKey": "[REDACTED]", "token": "[REDACTED]"}');
  });

  test('should redact AWS access keys', () => {
    const input = 'AKIAIOSFODNN7EXAMPLE';
    const result = redactSecrets(input);
    expect(result).toBe('AKIA[REDACTED]');
  });

  test('should redact JWT tokens', () => {
    const input = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const result = redactSecrets(input);
    expect(result).toBe('[JWT-REDACTED]');
  });

  test('should redact URL parameters', () => {
    const input = 'https://api.example.com?api_key=secret123&token=abc456';
    const result = redactSecrets(input);
    expect(result).toBe('https://api.example.com?[REDACTED]&[REDACTED]');
  });

  test('should handle multiple patterns in single text', () => {
    const input = `
      Authorization: Bearer sk-1234567890abcdef
      {"apiKey": "secret123"}
      AKIAIOSFODNN7EXAMPLE
      eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature
      https://api.com?token=secret
    `;
    const result = redactSecrets(input);
    expect(result).toContain('Authorization: Bearer [REDACTED]');
    expect(result).toContain('"apiKey": "[REDACTED]"');
    expect(result).toContain('AKIA[REDACTED]');
    expect(result).toContain('[JWT-REDACTED]');
    expect(result).toContain('[REDACTED]');
  });

  test('should not modify text without secrets', () => {
    const input = 'This is regular text without any secrets';
    const result = redactSecrets(input);
    expect(result).toBe(input);
  });

  test('should handle empty string', () => {
    const input = '';
    const result = redactSecrets(input);
    expect(result).toBe('');
  });

  test('should handle case variations', () => {
    const input = 'authorization: bearer sk-123 and Authorization:Bearer tk-456';
    const result = redactSecrets(input);
    expect(result).toBe('Authorization: Bearer [REDACTED] and Authorization: Bearer [REDACTED]');
  });

  test('should preserve original capturing groups in JSON keys', () => {
    const input = '{"password": "secret123", "accessKeyId": "AKIA123"}';
    const result = redactSecrets(input);
    expect(result).toBe('"password": "[REDACTED]", "accessKeyId": "[REDACTED]"');
  });
});