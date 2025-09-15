import { BaseAgent } from './core/BaseAgent';
import type { BaseAgentOptions, AgentConfig, AgentError, ErrorContext, ErrorRecovery } from './core/types';

interface SecurityCredentialsOptions extends BaseAgentOptions {
  serviceName: string;
  generateSSL?: boolean;
  generateAPIKeys?: boolean;
  generateDatabaseCredentials?: boolean;
  encryptionLevel?: 'basic' | 'strong' | 'enterprise';
  outputDirectory?: string;
}

export class SecurityCredentialsAgent extends BaseAgent<SecurityCredentialsOptions> {
  getAgentType(): string {
    return 'security-credentials';
  }

  getAllowedTools(): string[] {
    return ['Bash', 'Write', 'Read'];
  }

  buildPrompt(options: SecurityCredentialsOptions): string {
    const serviceName = options.serviceName;
    const generateSSL = options.generateSSL ?? false;
    const generateAPIKeys = options.generateAPIKeys ?? true;
    const generateDatabaseCredentials = options.generateDatabaseCredentials ?? true;
    const encryptionLevel = options.encryptionLevel ?? 'strong';
    const outputDirectory = options.outputDirectory || `/opt/docker-deployments/${serviceName}`;
    
    return `
Generate all security credentials required for the "${serviceName}" service deployment. Create strong, production-ready credentials following security best practices.

SECURITY REQUIREMENTS:
- Service: ${serviceName}
- SSL Certificate Generation: ${generateSSL}
- API Key Generation: ${generateAPIKeys}
- Database Credentials: ${generateDatabaseCredentials}
- Encryption Level: ${encryptionLevel}
- Output Directory: ${outputDirectory}

PHASE 1: SECURE PASSWORD GENERATION
Generate cryptographically secure passwords and keys:

1. **Database Credentials**:
   ${generateDatabaseCredentials ? `
   \`\`\`bash
   # Generate secure database passwords
   DB_ROOT_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
   DB_USER_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
   DB_REPLICATION_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
   
   echo "Generated database credentials"
   echo "Root password length: \${#DB_ROOT_PASSWORD}"
   echo "User password length: \${#DB_USER_PASSWORD}"
   \`\`\`
   ` : 'echo "Database credentials generation skipped"'}

2. **API Keys and Tokens**:
   ${generateAPIKeys ? `
   \`\`\`bash
   # Generate API keys with different formats
   API_KEY=$(openssl rand -hex 32)
   JWT_SECRET=$(openssl rand -base64 64 | tr -d "=+/" | cut -c1-50)
   ENCRYPTION_KEY=$(openssl rand -hex 16)
   SESSION_SECRET=$(openssl rand -base64 48 | tr -d "=+/" | cut -c1-40)
   
   # Generate application-specific secrets
   ADMIN_TOKEN=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
   WEBHOOK_SECRET=$(openssl rand -hex 20)
   
   echo "Generated API credentials"
   echo "API Key: \${API_KEY:0:8}..."
   echo "JWT Secret length: \${#JWT_SECRET}"
   \`\`\`
   ` : 'echo "API key generation skipped"'}

PHASE 2: SSL CERTIFICATE GENERATION
${generateSSL ? `
3. **Self-Signed SSL Certificates**:
   \`\`\`bash
   # Create certificates directory
   mkdir -p "${outputDirectory}/ssl"
   cd "${outputDirectory}/ssl"
   
   # Generate private key
   openssl genrsa -out ${serviceName}.key 2048
   
   # Generate certificate signing request
   openssl req -new -key ${serviceName}.key -out ${serviceName}.csr -subj "/C=US/ST=Local/L=Local/O=${serviceName}/CN=${serviceName}.local"
   
   # Generate self-signed certificate (valid for 1 year)
   openssl x509 -req -days 365 -in ${serviceName}.csr -signkey ${serviceName}.key -out ${serviceName}.crt
   
   # Generate PEM bundle
   cat ${serviceName}.crt ${serviceName}.key > ${serviceName}.pem
   
   # Set secure permissions
   chmod 600 ${serviceName}.key
   chmod 644 ${serviceName}.crt
   chmod 600 ${serviceName}.pem
   
   echo "SSL certificates generated:"
   ls -la *.crt *.key *.pem
   \`\`\`

4. **Certificate Authority (for internal services)**:
   \`\`\`bash
   # Generate CA private key
   openssl genrsa -out ca.key 4096
   
   # Generate CA certificate
   openssl req -new -x509 -days 3650 -key ca.key -out ca.crt -subj "/C=US/ST=Local/L=Local/O=${serviceName}-CA/CN=${serviceName}-CA"
   
   # Generate server certificate signed by CA
   openssl genrsa -out server.key 2048
   openssl req -new -key server.key -out server.csr -subj "/C=US/ST=Local/L=Local/O=${serviceName}/CN=${serviceName}-server.local"
   openssl x509 -req -days 365 -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out server.crt
   
   echo "CA and server certificates generated"
   \`\`\`
` : 'echo "SSL certificate generation skipped"'}

PHASE 3: ENCRYPTION KEYS
5. **Application Encryption Keys**:
   \`\`\`bash
   # Generate different types of encryption keys based on level
   case "${encryptionLevel}" in
     "basic")
       ENCRYPTION_KEY_256=$(openssl rand -hex 32)  # 256-bit
       ;;
     "strong")
       ENCRYPTION_KEY_256=$(openssl rand -hex 32)  # 256-bit
       ENCRYPTION_KEY_512=$(openssl rand -hex 64)  # 512-bit
       ;;
     "enterprise")
       ENCRYPTION_KEY_256=$(openssl rand -hex 32)  # 256-bit
       ENCRYPTION_KEY_512=$(openssl rand -hex 64)  # 512-bit
       MASTER_KEY=$(openssl rand -hex 32)          # Master key
       ;;
   esac
   
   echo "Generated encryption keys for level: ${encryptionLevel}"
   \`\`\`

PHASE 4: SECURE STORAGE
6. **Environment File Creation**:
   Create .env.secrets file with all generated credentials:
   
   \`\`\`bash
   cat > "${outputDirectory}/.env.secrets" << 'EOF'
# Security Credentials for ${serviceName}
# Generated on: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
# WARNING: Keep this file secure and never commit to version control

# Database Credentials
${generateDatabaseCredentials ? `DB_ROOT_PASSWORD=\${DB_ROOT_PASSWORD}
DB_USER_PASSWORD=\${DB_USER_PASSWORD}
DB_REPLICATION_PASSWORD=\${DB_REPLICATION_PASSWORD}
DB_NAME=${serviceName}_db
DB_USER=${serviceName}_user` : '# Database credentials not generated'}

# API Keys and Tokens  
${generateAPIKeys ? `API_KEY=\${API_KEY}
JWT_SECRET=\${JWT_SECRET}
ENCRYPTION_KEY=\${ENCRYPTION_KEY}
SESSION_SECRET=\${SESSION_SECRET}
ADMIN_TOKEN=\${ADMIN_TOKEN}
WEBHOOK_SECRET=\${WEBHOOK_SECRET}` : '# API keys not generated'}

# Encryption Keys
ENCRYPTION_KEY_256=\${ENCRYPTION_KEY_256}
${encryptionLevel !== 'basic' ? 'ENCRYPTION_KEY_512=${ENCRYPTION_KEY_512}' : ''}
${encryptionLevel === 'enterprise' ? 'MASTER_KEY=${MASTER_KEY}' : ''}

# SSL Configuration
${generateSSL ? `SSL_CERT_PATH=./ssl/${serviceName}.crt
SSL_KEY_PATH=./ssl/${serviceName}.key
SSL_PEM_PATH=./ssl/${serviceName}.pem
CA_CERT_PATH=./ssl/ca.crt` : '# SSL certificates not generated'}

# Security Settings
BCRYPT_ROUNDS=12
PASSWORD_MIN_LENGTH=12
SESSION_TIMEOUT=3600
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION=900

EOF
   
   # Set secure permissions on secrets file
   chmod 600 "${outputDirectory}/.env.secrets"
   \`\`\`

7. **Security Documentation**:
   \`\`\`bash
   cat > "${outputDirectory}/SECURITY.md" << 'EOF'
# Security Information for ${serviceName}

## Generated Credentials

This deployment includes the following security credentials:

${generateDatabaseCredentials ? `### Database Credentials
- Root password: 25 characters, base64 encoded
- User password: 25 characters, base64 encoded  
- Replication password: 25 characters, base64 encoded` : ''}

${generateAPIKeys ? `### API Keys and Tokens
- API Key: 64 characters, hexadecimal
- JWT Secret: 50 characters, base64 encoded
- Encryption Key: 32 characters, hexadecimal
- Session Secret: 40 characters, base64 encoded
- Admin Token: 25 characters, base64 encoded
- Webhook Secret: 40 characters, hexadecimal` : ''}

### Encryption Keys
- Level: ${encryptionLevel}
- 256-bit encryption key included
${encryptionLevel !== 'basic' ? `- 512-bit encryption key included` : ''}
${encryptionLevel === 'enterprise' ? `- Master key for key derivation included` : ''}

${generateSSL ? `### SSL Certificates
- Self-signed certificate for ${serviceName}.local
- Certificate Authority for internal services
- Valid for 365 days (server) / 10 years (CA)
- 2048-bit RSA keys` : ''}

## Security Best Practices

1. **Credential Rotation**: Rotate all credentials every 90 days
2. **Access Control**: Limit access to .env.secrets file (600 permissions)
3. **Backup Security**: Encrypt backups containing credentials
4. **Network Security**: Use TLS for all external communications
5. **Monitoring**: Monitor for unauthorized access attempts

## File Permissions

\`\`\`bash
chmod 600 .env.secrets    # Owner read/write only
chmod 600 ssl/*.key       # Private keys
chmod 644 ssl/*.crt       # Certificates  
chmod 600 ssl/*.pem       # PEM bundles
\`\`\`

## Credential Verification

To verify credentials are properly generated:

\`\`\`bash
# Check password complexity
grep "PASSWORD" .env.secrets | wc -l

# Verify SSL certificate
openssl x509 -in ssl/${serviceName}.crt -text -noout | grep "Subject:"

# Test encryption key strength
grep "ENCRYPTION_KEY" .env.secrets | head -1 | cut -d'=' -f2 | wc -c
\`\`\`

EOF
   \`\`\`

PHASE 5: SECURITY VALIDATION
8. **Credential Strength Validation**:
   \`\`\`bash
   echo "=== SECURITY VALIDATION ==="
   
   # Validate password lengths
   if [ ! -z "\${DB_ROOT_PASSWORD}" ]; then
     echo "Database root password length: \${#DB_ROOT_PASSWORD}"
   fi
   
   if [ ! -z "\${API_KEY}" ]; then
     echo "API key length: \${#API_KEY}"
   fi
   
   # Validate file permissions
   echo "File permissions:"
   ls -la "${outputDirectory}/.env.secrets" 2>/dev/null || echo "Secrets file not found"
   ls -la "${outputDirectory}/ssl/"*.key 2>/dev/null || echo "SSL keys not found"
   
   # Check entropy of generated passwords
   if command -v entropy &> /dev/null; then
     echo "Password entropy check available"
   else
     echo "Entropy check not available (install ent package for validation)"
   fi
   
   echo "=== VALIDATION COMPLETE ==="
   \`\`\`

FINAL OUTPUT:
Generate JSON output summarizing all created credentials and files:

\`\`\`json
{
  "credentialsGenerated": {
    "databaseCredentials": ${generateDatabaseCredentials},
    "apiKeys": ${generateAPIKeys},
    "sslCertificates": ${generateSSL},
    "encryptionKeys": true,
    "encryptionLevel": "${encryptionLevel}"
  },
  "files": {
    "secretsFile": "${outputDirectory}/.env.secrets",
    "securityDoc": "${outputDirectory}/SECURITY.md",
    "sslCertificates": ${generateSSL ? `{
      "certificate": "${outputDirectory}/ssl/${serviceName}.crt",
      "privateKey": "${outputDirectory}/ssl/${serviceName}.key",
      "pemBundle": "${outputDirectory}/ssl/${serviceName}.pem",
      "caCertificate": "${outputDirectory}/ssl/ca.crt"
    }` : 'null'}
  },
  "security": {
    "passwordStrength": "Strong (25+ characters, base64)",
    "encryptionKeySize": "${encryptionLevel === 'basic' ? '256-bit' : encryptionLevel === 'strong' ? '256/512-bit' : '256/512-bit + master key'}",
    "certificateValidity": "${generateSSL ? '365 days' : 'N/A'}",
    "filePermissions": {
      "secrets": "600 (owner only)",
      "sslKeys": "600 (owner only)",
      "certificates": "644 (readable)"
    }
  },
  "recommendations": [
    "Review and customize default security settings",
    "Set up regular credential rotation schedule",
    "Configure backup encryption for credential files",
    "Implement monitoring for credential access",
    "Test SSL certificate installation"
  ],
  "warnings": [
    "Never commit .env.secrets to version control",
    "Backup credentials securely before deployment",
    "Rotate default credentials after initial deployment",
    "Monitor for unauthorized access to credential files"
  ]
}
\`\`\`

Generate cryptographically secure credentials following industry best practices.
Ensure all files have appropriate permissions and are properly documented.
`;
  }

  getSystemPrompt(): string {
    return `
You are a security credentials specialist with expertise in:

CRYPTOGRAPHIC SECURITY:
- Secure random number generation
- Password complexity and entropy
- Encryption key management
- SSL/TLS certificate generation
- Digital signature algorithms
- Key derivation functions

CREDENTIAL MANAGEMENT:
- API key generation and rotation
- Database credential security
- Session management tokens
- Webhook secret generation
- Multi-factor authentication setup
- Zero-trust security principles

CERTIFICATE MANAGEMENT:
- X.509 certificate generation
- Certificate Authority setup
- Self-signed certificate creation
- Certificate chain validation
- Key exchange protocols
- Certificate lifecycle management

SECURITY BEST PRACTICES:
- Least privilege access control
- Defense in depth strategies
- Secure file permissions
- Credential rotation policies
- Security monitoring and alerting
- Compliance with security standards

OPERATIONAL SECURITY:
- Secure storage and backup
- Environment isolation
- Secret management systems
- Security documentation
- Incident response procedures
- Security audit trails

OBJECTIVES:
- Generate cryptographically secure credentials
- Implement defense-in-depth security measures
- Follow industry security standards and best practices
- Create comprehensive security documentation
- Ensure proper access controls and permissions

Always prioritize security over convenience.
Generate credentials with maximum entropy and complexity.
Implement comprehensive access controls and monitoring.
`;
  }

  getCapabilities(): Record<string, any> {
    const config = this.getConfig();
    return {
      name: config.name,
      version: config.version,
      description: config.description,
      capabilities: config.capabilities,
      outputFormat: 'json',
      securityFeatures: [
        'Cryptographically secure random generation',
        'Multi-level encryption key generation',
        'SSL/TLS certificate creation',
        'Secure file permission management',
        'Comprehensive security documentation'
      ]
    };
  }

  getConfig(): AgentConfig {
    return {
      name: 'Security Credentials Agent',
      version: '1.0.0',
      description: 'Generates secure passwords, API keys, SSL certificates, and encryption keys',
      defaultOptions: {
        timeout_ms: 120000, // 2 minutes
        maxTurns: 20,
        permissionMode: 'acceptEdits'
      },
      capabilities: [
        'Secure password generation',
        'API key and token creation',
        'SSL certificate generation',
        'Encryption key management',
        'Database credential creation',
        'Certificate Authority setup',
        'Security documentation',
        'File permission management',
        'Credential validation'
      ],
      requiredTools: ['Bash', 'Write'],
      optionalTools: ['Read'],
      typicalExecutionTime: 90000, // 1.5 minutes
      costEstimate: {
        min: 0.05,
        max: 0.20,
        typical: 0.10
      }
    };
  }

  protected async handleAgentSpecificError(error: AgentError, context: ErrorContext): Promise<ErrorRecovery> {
    if (error.message.includes('openssl') && error.message.includes('command not found')) {
      return {
        action: 'abort' as const,
        message: 'OpenSSL is required but not installed on the system'
      };
    }

    if (error.message.includes('permission denied') && error.message.includes('ssl')) {
      return {
        action: 'retry' as const,
        modifiedPrompt: 'Create SSL certificates in current directory instead of /opt',
        message: 'Permission denied for SSL directory, using current directory'
      };
    }

    if (error.message.includes('mkdir') || error.message.includes('permission denied')) {
      return {
        action: 'retry' as const,
        modifiedPrompt: 'Use current directory for all file operations',
        message: 'Permission denied creating directories, using current working directory'
      };
    }

    if (error.message.includes('entropy') || error.message.includes('random')) {
      return {
        action: 'continue' as const,
        message: 'Low entropy warning, continuing with available randomness'
      };
    }

    return super.handleAgentSpecificError(error, context);
  }
}