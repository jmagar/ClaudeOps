interface RedactionRule {
  name: string;
  pattern: RegExp;
  replacement: string | ((match: string) => string);
}

const redactionRules: RedactionRule[] = [
  {
    name: 'authorization',
    pattern: /Authorization[:\s]*Bearer\s+\S+/gi,
    replacement: 'Authorization: Bearer [REDACTED]'
  },
  {
    name: 'jsonKeys',
    pattern: /"(apiKey|apikey|api_key|secret|password|token|accessKeyId|secretAccessKey)"\s*:\s*"[^"]+"/gi,
    replacement: '"$1": "[REDACTED]"'
  },
  {
    name: 'awsKeys',
    pattern: /AKIA[0-9A-Z]{16}/g,
    replacement: 'AKIA[REDACTED]'
  },
  {
    name: 'jwt',
    pattern: /\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
    replacement: '[JWT-REDACTED]'
  },
  {
    name: 'urlParams',
    pattern: /\b(?:token|secret|password|api[_-]?key)=\S+/gi,
    replacement: '[REDACTED]'
  }
];

export function redactSecrets(text: string): string {
  return redactionRules.reduce((result, rule) => {
    if (typeof rule.replacement === 'string') {
      return result.replace(rule.pattern, rule.replacement);
    } else {
      return result.replace(rule.pattern, rule.replacement);
    }
  }, text);
}