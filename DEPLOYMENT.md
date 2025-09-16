# ClaudeOps Deployment Guide

This guide covers deploying ClaudeOps in different environments with proper configuration management.

## Environment Configuration

ClaudeOps supports multiple environment configurations:

- **Development**: Local development with debug logging and reduced limits
- **Staging**: Pre-production environment with monitoring and SSL
- **Production**: Full production deployment with security, monitoring, and backups
- **Test**: Testing environment with minimal resources

## Quick Start (Development)

1. **Clone and Setup**
   ```bash
   git clone <repository-url>
   cd claudeops
   npm install
   ```

2. **Environment Configuration**
   ```bash
   cp .env.local.example .env.local
   # Edit .env.local with your Claude API key
   ```

3. **Database Setup**
   ```bash
   npm run db:generate
   npm run db:migrate
   ```

4. **Start Development Server**
   ```bash
   npm run dev
   ```

## Production Deployment

### Docker Deployment (Recommended)

1. **Prepare Environment**
   ```bash
   # Create production environment file
   cp .env.local.example .env.production
   # Edit .env.production with production settings
   ```

2. **Build and Deploy**
   ```bash
   # Build Docker image
   npm run docker:build
   
   # Deploy with Docker Compose
   npm run docker:compose:build
   ```

3. **Environment Variables**
   
   Required variables in `.env.production`:
   ```env
   NODE_ENV=production
   NEXT_PUBLIC_APP_URL=https://claudeops.yourdomain.com
   ANTHROPIC_API_KEY=your_actual_api_key
   NEXTAUTH_SECRET=your_secure_secret
   DATABASE_URL=sqlite:./data/production.db
   ```

### Manual Production Deployment

1. **Build Application**
   ```bash
   NODE_ENV=production npm run build
   npm run db:migrate
   ```

2. **Start Production Server**
   ```bash
   npm start
   ```

3. **Process Management (PM2)**
   ```bash
   npm install -g pm2
   pm2 start npm --name "claudeops" -- start
   pm2 startup
   pm2 save
   ```

## Environment-Specific Features

### Development Environment
- Debug logging enabled
- Hot reload enabled  
- Reduced cost limits
- Development database
- Console logging

### Production Environment
- SSL/HTTPS enforcement
- Database backups enabled
- Metrics collection
- Rate limiting
- File logging only
- Resource limits enforced

### Staging Environment
- SSL enabled
- Monitoring active
- Backup enabled (shorter retention)
- Similar to production but with relaxed limits

## Configuration Management

### Environment Variables

The application uses a hierarchical configuration system:

1. **Environment defaults** (based on NODE_ENV)
2. **Environment variables** (override defaults)
3. **Configuration files** (additional overrides)

### Key Configuration Areas

#### Cost Management
```env
COST_ALERT_THRESHOLD=50.00
MONTHLY_BUDGET_LIMIT=500.00
COST_BUDGET_DAILY=25.00
```

#### Agent Limits
```env
MAX_CONCURRENT_AGENTS=5
DEFAULT_AGENT_TIMEOUT=300000
AGENT_MEMORY_LIMIT=1024
AGENT_CPU_LIMIT=80
```

#### Security (Production)
```env
SSL_CERT_PATH=/etc/ssl/certs/claudeops.crt
SSL_KEY_PATH=/etc/ssl/private/claudeops.key
RATE_LIMIT_MAX_REQUESTS=1000
```

#### Monitoring
```env
ENABLE_METRICS=true
METRICS_PORT=9090
HEALTH_CHECK_INTERVAL=60000
```

## Docker Compose Services

The docker-compose.yml includes several services:

### Core Services
- **claudeops**: Main application
- **backup-service**: Automated database backups
- **log-rotator**: Log file management

### Optional Services (Profiles)
- **reverse-proxy**: Traefik with SSL (profile: proxy)
- **prometheus**: Metrics collection (profile: monitoring)
- **grafana**: Dashboard visualization (profile: monitoring)

Enable optional services:
```bash
# With reverse proxy and SSL
docker-compose --profile proxy up -d

# With monitoring
docker-compose --profile monitoring up -d

# All services
docker-compose --profile proxy --profile monitoring up -d
```

## SSL/HTTPS Configuration

### Using Traefik (Recommended)
The included Traefik configuration automatically handles:
- SSL certificate generation (Let's Encrypt)
- HTTP to HTTPS redirects
- Automatic certificate renewal

### Manual SSL Setup
1. Obtain SSL certificates
2. Configure environment variables:
   ```env
   SSL_CERT_PATH=/path/to/certificate.crt
   SSL_KEY_PATH=/path/to/private.key
   ENFORCE_HTTPS=true
   ```

## Database Management

### Backups
Automated backups are configured in production:

```bash
# Manual backup
npm run backup:prod

# Backup configuration
BACKUP_ENABLED=true
BACKUP_INTERVAL_HOURS=24
BACKUP_RETENTION_DAYS=30
```

### Migrations
```bash
# Run migrations
npm run db:migrate

# Generate new migration
npm run db:generate
```

## Monitoring and Health Checks

### Health Endpoint
```
GET /api/system/health
```

### Metrics Endpoint (Production)
```
GET /api/metrics
```

### Log Management
- **Development**: Console output
- **Production**: File-based logging with rotation
- **Docker**: Centralized logging via Docker driver

## Troubleshooting

### Common Issues

1. **Database Connection Issues**
   ```bash
   # Check database file permissions
   ls -la data/
   
   # Reset database
   npm run db:reset
   ```

2. **Environment Variable Issues**
   ```bash
   # Validate configuration
   npm run type-check
   
   # Check environment loading
   node -e "console.log(process.env.NODE_ENV)"
   ```

3. **Docker Build Issues**
   ```bash
   # Clean build
   docker system prune -f
   npm run docker:build --no-cache
   ```

### Health Checks

1. **Application Health**
   ```bash
   npm run health-check
   # or
   curl -f http://localhost:3000/api/system/health
   ```

2. **Docker Container Health**
   ```bash
   docker-compose ps
   docker-compose logs claudeops
   ```

## Security Considerations

### Production Security Checklist
- [ ] ANTHROPIC_API_KEY is secure and not in version control
- [ ] NEXTAUTH_SECRET is randomly generated and secure
- [ ] SSL/HTTPS is properly configured
- [ ] Database backups are working
- [ ] Rate limiting is enabled
- [ ] Security headers are configured
- [ ] File permissions are properly set
- [ ] Firewall rules are configured

### Environment Isolation
- Use separate databases for each environment
- Different API keys/secrets for each environment  
- Isolated backup storage
- Separate monitoring/logging

## Scaling Considerations

### Horizontal Scaling
- Multiple application instances behind load balancer
- Shared database or database clustering
- Distributed session management

### Performance Optimization
- Enable caching (CONFIG_CACHE_TTL)
- Optimize database queries
- Configure CDN for static assets
- Monitor resource usage

## Backup and Recovery

### Database Backup
```bash
# Create backup
npm run backup:prod

# Restore from backup
cp backups/production_20240114_120000.db.gz data/
gunzip data/production_20240114_120000.db.gz
mv data/production_20240114_120000.db data/production.db
```

### Application Backup
- Environment configuration files
- SSL certificates
- Application logs
- Database files

## Support and Maintenance

### Regular Tasks
- Monitor application health and performance
- Review and rotate logs
- Update dependencies
- Review and test backups
- Monitor cost usage
- Update SSL certificates (if manual)

### Monitoring Alerts
Set up alerts for:
- High cost usage
- Agent execution failures
- Database connection issues
- SSL certificate expiration
- Disk space usage

---

For more detailed configuration options, see the source files:
- `src/lib/config/environment.ts` - Environment configuration
- `src/lib/config/deploymentConfig.ts` - Deployment configuration
- `docker-compose.yml` - Docker services configuration