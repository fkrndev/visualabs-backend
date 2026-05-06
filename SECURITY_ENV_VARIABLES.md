# Security Environment Variables

This document lists all security-related environment variables that can be used to control security features in the VIMS application. All features are **disabled by default** unless explicitly enabled.

## Security Headers

### Content Security Policy (CSP)
```bash
# Enable CSP headers (default: false)
ENABLE_CSP=true

# Custom CSP policy (optional)
CSP_POLICY="default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none';"
```

### X-Frame-Options
```bash
# Enable X-Frame-Options header (default: false)
ENABLE_X_FRAME_OPTIONS=true

# Custom X-Frame-Options value (optional)
X_FRAME_OPTIONS=DENY
```

### X-Content-Type-Options
```bash
# Enable X-Content-Type-Options header (default: false)
ENABLE_X_CONTENT_TYPE_OPTIONS=true
```

### XSS Protection
```bash
# Enable X-XSS-Protection header (default: false)
ENABLE_X_XSS_PROTECTION=true
```

### Referrer Policy
```bash
# Enable Referrer-Policy header (default: false)
ENABLE_REFERRER_POLICY=true

# Custom Referrer-Policy value (optional)
REFERRER_POLICY=strict-origin-when-cross-origin
```

### Permissions Policy
```bash
# Enable Permissions-Policy header (default: false)
ENABLE_PERMISSIONS_POLICY=true

# Custom Permissions-Policy value (optional)
PERMISSIONS_POLICY="geolocation=(), microphone=(), camera=(), payment=()"
```

### HSTS (HTTP Strict Transport Security)
```bash
# Enable HSTS header (default: false, only works in production)
ENABLE_HSTS=true

# Custom HSTS policy (optional)
HSTS_POLICY="max-age=31536000; includeSubDomains; preload"
```

### Server Header Removal
```bash
# Remove Server header (default: false)
ENABLE_REMOVE_SERVER=true
```

### Cache Control
```bash
# Enable cache control headers for sensitive requests (default: false)
ENABLE_CACHE_CONTROL=true
```

## XSS Protection

### XSS Sanitization
```bash
# Enable XSS sanitization for user input (default: false)
ENABLE_XSS_PROTECTION=true
```

## Password Security

### Password Hashing
```bash
# Bcrypt cost factor (default: 12)
BCRYPT_COST=12

# Disable password hashing (for testing only, default: false)
DISABLE_PASSWORD_HASHING=true
```

## Permission System

### Role-Based Access Control
```bash
# Enable permission system (default: true)
ENABLE_PERMISSION_SYSTEM=true

# Default role when permission system is disabled (default: 1 - Admin)
DEFAULT_ROLE_WHEN_DISABLED=1
```

## Account Lockout

### Brute Force Protection
```bash
# Enable account lockout (default: true)
ENABLE_ACCOUNT_LOCKOUT=true

# Max failed attempts before lockout (default: 5)
ACCOUNT_LOCKOUT_MAX_ATTEMPTS=5
```

## Security Logging

### Security Event Logging
```bash
# Enable security logging (default: true)
ENABLE_SECURITY_LOGGING=true
```

## Soft Delete

### Soft Delete Control
```bash
# Enable soft delete functionality (default: true)
ENABLE_SOFT_DELETE=true
```

## Existing Security Variables

### CSRF Protection
```bash
# Disable CSRF protection (default: false)
DISABLE_CSRF=true

# CSRF secret (required in production)
CSRF_SECRET=your-csrf-secret-key
```

### Rate Limiting
```bash
# Enable rate limiting (default: true)
ENABLE_RATE_LIMIT=true

# Max requests per 15 minutes (default: 5)
RATE_LIMIT_MAX_REQUESTS=5
```

### JWT Configuration
```bash
# JWT secret (required)
JWT_SECRET=your-jwt-secret-key

# JWT expiration time (default: 1h)
JWT_EXPIRES_IN=1h

# JWT refresh token expiration time (default: 7d)
JWT_REFRESH_TOKEN_EXPIRES_IN=7d
```

### OAuth Configuration
```bash
# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI_CUSTOMER=http://localhost:3006/api/public/auth/google/callback
GOOGLE_REDIRECT_URI_ADMIN=http://localhost:3006/api/auth/google/callback
```

### Development Bypass
```bash
# Bypass password for development (default: none)
BYPASS_PASSWORD=dev-password
```

## Recommended Configurations

### Development Environment
```bash
# .env.development
NODE_ENV=development
DISABLE_CSRF=true
ENABLE_RATE_LIMIT=false
ENABLE_ACCOUNT_LOCKOUT=false
ENABLE_SECURITY_LOGGING=true
ENABLE_XSS_PROTECTION=false
ENABLE_PERMISSION_SYSTEM=false
DISABLE_PASSWORD_HASHING=true
ENABLE_SOFT_DELETE=false
RATE_LIMIT_MAX_REQUESTS=100
ACCOUNT_LOCKOUT_MAX_ATTEMPTS=10
JWT_EXPIRES_IN=24h
JWT_REFRESH_TOKEN_EXPIRES_IN=30d
```

### Production Environment
```bash
# .env.production
NODE_ENV=production
DISABLE_CSRF=false
ENABLE_RATE_LIMIT=true
ENABLE_ACCOUNT_LOCKOUT=true
ENABLE_SECURITY_LOGGING=true
ENABLE_XSS_PROTECTION=true
ENABLE_PERMISSION_SYSTEM=true
DISABLE_PASSWORD_HASHING=false
ENABLE_SOFT_DELETE=true
ENABLE_CSP=true
ENABLE_X_FRAME_OPTIONS=true
ENABLE_X_CONTENT_TYPE_OPTIONS=true
ENABLE_X_XSS_PROTECTION=true
ENABLE_REFERRER_POLICY=true
ENABLE_PERMISSIONS_POLICY=true
ENABLE_HSTS=true
ENABLE_REMOVE_SERVER=true
ENABLE_CACHE_CONTROL=true
RATE_LIMIT_MAX_REQUESTS=5
ACCOUNT_LOCKOUT_MAX_ATTEMPTS=5
BCRYPT_COST=12
JWT_SECRET=strong-random-secret
JWT_EXPIRES_IN=15m
JWT_REFRESH_TOKEN_EXPIRES_IN=7d
CSRF_SECRET=strong-csrf-secret
```

### Testing Environment
```bash
# .env.test
NODE_ENV=test
DISABLE_CSRF=true
ENABLE_RATE_LIMIT=false
ENABLE_ACCOUNT_LOCKOUT=false
ENABLE_SECURITY_LOGGING=false
ENABLE_XSS_PROTECTION=false
ENABLE_PERMISSION_SYSTEM=false
DISABLE_PASSWORD_HASHING=true
ENABLE_SOFT_DELETE=false
RATE_LIMIT_MAX_REQUESTS=1000
```

## Security Best Practices

1. **Always use strong secrets** in production for JWT_SECRET and CSRF_SECRET
2. **Enable all security headers** in production for maximum protection
3. **Use appropriate bcrypt cost** (12-15 is recommended)
4. **Monitor security logs** regularly for suspicious activities
5. **Keep JWT expiration times short** (15 minutes) for access tokens
6. **Use HTTPS in production** (required for HSTS and secure cookies)
7. **Regularly rotate secrets** and update environment variables
8. **Never commit .env files** to version control

## Security Impact

When security features are disabled:
- **CSRF**: Application becomes vulnerable to cross-site request forgery attacks
- **XSS Protection**: User input is not sanitized, allowing XSS attacks
- **Account Lockout**: Brute force attacks become possible
- **Security Logging**: Security events are not tracked
- **Permission System**: All users get full access if disabled
- **Password Hashing**: Passwords are stored in plain text (testing only)
- **Security Headers**: Application loses various browser protections

Only disable security features in development/testing environments where the risk is acceptable.
