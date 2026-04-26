# Naming Conventions Guide

This document establishes consistent naming conventions for the VIMS backend project.

## File Naming

- **TypeScript files**: Use `camelCase` with `.ts` extension
  - Example: `userService.ts`, `authMiddleware.ts`, `dataVersioning.ts`
- **Test files**: Use `camelCase` with `.test.ts` or `.spec.ts` extension
  - Example: `userService.test.ts`, `authMiddleware.spec.ts`
- **Configuration files**: Use `kebab-case` or standard config names
  - Example: `.eslintrc.json`, `.prettierrc`, `tsconfig.json`

## Variable Naming

- **Variables**: Use `camelCase`
  - Example: `userId`, `customerData`, `isValid`
- **Constants**: Use `UPPER_SNAKE_CASE`
  - Example: `MAX_RETRIES`, `DEFAULT_TIMEOUT`, `API_BASE_URL`
- **Boolean variables**: Prefix with `is`, `has`, `should`, `can`
  - Example: `isActive`, `hasPermission`, `shouldRetry`, `canEdit`

## Function Naming

- **Functions**: Use `camelCase` with descriptive verbs
  - Example: `getUserById()`, `validateEmail()`, `createAuditLog()`
- **Async functions**: Use `camelCase` with descriptive verbs
  - Example: `fetchUserData()`, `saveVersion()`, `authenticateUser()`
- **Event handlers**: Prefix with `handle` or `on`
  - Example: `handleSubmit()`, `onUserLogin()`, `handleError()`

## Class Naming

- **Classes**: Use `PascalCase`
  - Example: `UserService`, `AuditLogger`, `ErrorRecovery`
- **Interfaces**: Use `PascalCase` with optional `I` prefix (but prefer without)
  - Example: `UserData`, `VersionData`, `RecoveryConfig`
- **Types**: Use `PascalCase`
  - Example: `LogLevel`, `AuditAction`, `RecoveryStrategy`

## Database Naming

- **Tables**: Use `snake_case` and plural form
  - Example: `users`, `customer_profiles`, `audit_logs`, `data_versions`
- **Columns**: Use `snake_case`
  - Example: `user_id`, `created_at`, `is_active`, `data_json`
- **Foreign keys**: Use `{table}_id` pattern
  - Example: `user_id`, `customer_id`, `subscription_id`
- **Indexes**: Use `{table}_{column}_idx` or descriptive name
  - Example: `users_email_unique`, `audit_logs_user_idx`

## API Naming

- **Routes**: Use `kebab-case` for URL paths
  - Example: `/api/users`, `/api/customer-profiles`, `/api/auth/login`
- **Query parameters**: Use `camelCase` or `snake_case` (be consistent)
  - Example: `?userId=123`, `?page=1&limit=20`
- **Response fields**: Use `camelCase`
  - Example: `userId`, `createdAt`, `isActive`

## Component Naming (if using frontend)

- **Components**: Use `PascalCase`
  - Example: `UserProfile`, `AuditLogViewer`, `DataVersionHistory`

## General Guidelines

1. **Be descriptive**: Names should clearly describe what the variable/function does
2. **Avoid abbreviations**: Unless widely known (e.g., `id`, `url`, `api`)
3. **Use consistent terminology**: If you use "customer" in one place, don't use "client" elsewhere
4. **Keep it short but meaningful**: Balance brevity with clarity
5. **Follow language conventions**: TypeScript/JavaScript conventions for TS/JS files

## Examples

### Good Names

```typescript
// Variables
const userId = 123;
const isActive = true;
const MAX_RETRIES = 3;

// Functions
function getUserById(id: number) { }
async function createAuditLog(data: AuditData) { }
function handleUserLogin() { }

// Classes
class UserService { }
class AuditLogger { }

// Database
CREATE TABLE audit_logs (
  id INT PRIMARY KEY,
  user_id INT,
  created_at TIMESTAMP
);
```

### Bad Names

```typescript
// Variables
const uid = 123; // Too abbreviated
const flag = true; // Not descriptive
const d = new Date(); // Single letter

// Functions
function get() {} // Not descriptive
function doIt() {} // Vague
function data() {} // Noun instead of verb

// Classes
class user {} // Lowercase
class USR {} // Abbreviated
```

## Migration Notes

When refactoring existing code to follow these conventions:

1. Update one module at a time
2. Run tests after each change
3. Update related imports and references
4. Commit changes separately from functional changes
