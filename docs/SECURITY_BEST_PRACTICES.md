# Security Best Practices

## Critical Rule: Never Commit Secrets

**NEVER hardcode API keys, passwords, tokens, or any sensitive credentials in code that will be committed to version control.**

## Why This Matters

1. **Git History is Permanent** - Even if you delete a secret later, it remains in Git history
2. **Public Repositories** - Secrets can be scraped by bots within minutes
3. **Team Access** - Anyone with repository access can see all historical secrets
4. **Credential Rotation Required** - Exposed secrets must be rotated immediately, causing downtime

## Safe Approaches for Handling Secrets

### ✅ Option 1: Environment Variables (RECOMMENDED)

Use environment variables that are set on the user's machine:

```bash
# In deployment script
if [ -z "$VITE_GOOGLE_CLIENT_ID" ] || [ -z "$VITE_GOOGLE_API_KEY" ]; then
    echo "ERROR: Missing required environment variables"
    echo "export VITE_GOOGLE_CLIENT_ID='your-client-id'"
    echo "export VITE_GOOGLE_API_KEY='your-api-key'"
    exit 1
fi

# Use the variables
ssh $SERVER "cat > /path/.env << EOF
VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
VITE_GOOGLE_API_KEY=$VITE_GOOGLE_API_KEY
EOF"
```

**How to set environment variables:**
```bash
# Temporary (current session only)
export VITE_GOOGLE_CLIENT_ID='your-actual-client-id'
export VITE_GOOGLE_API_KEY='your-actual-api-key'

# Persistent (add to ~/.zshrc or ~/.bashrc)
echo "export VITE_GOOGLE_CLIENT_ID='your-actual-client-id'" >> ~/.zshrc
echo "export VITE_GOOGLE_API_KEY='your-actual-api-key'" >> ~/.zshrc
source ~/.zshrc
```

### ✅ Option 2: Interactive Prompts

Prompt the user to enter secrets when running the script:

```bash
read -sp "Enter Google Client ID: " GOOGLE_CLIENT_ID
echo
read -sp "Enter Google API Key: " GOOGLE_API_KEY
echo
```

### ✅ Option 3: External Secret Files

Use .env files that are properly .gitignored:

```bash
# Load from local .env file
if [ -f ".env.deploy" ]; then
    source .env.deploy
else
    echo "ERROR: .env.deploy file not found"
    exit 1
fi
```

**.env.deploy** (NOT committed):
```bash
VITE_GOOGLE_CLIENT_ID=your-actual-client-id
VITE_GOOGLE_API_KEY=your-actual-api-key
```

**.gitignore**:
```
.env.deploy
.env.local
*.secret
```

### ✅ Option 4: Secret Management Tools

For production environments:
- **1Password CLI** - `op read "op://vault/item/field"`
- **AWS Secrets Manager** - `aws secretsmanager get-secret-value`
- **HashiCorp Vault** - `vault kv get secret/myapp`
- **GitHub Secrets** (for CI/CD)

## What NOT to Do

### ❌ NEVER: Hardcode Secrets

```bash
# WRONG - NEVER DO THIS
VITE_GOOGLE_CLIENT_ID=123456789-abcdefghijklmnop.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=AIzaSyD1234567890abcdefghijklmnop
```

### ❌ NEVER: Use Comments with Real Secrets

```bash
# WRONG - Still visible in Git history
# VITE_GOOGLE_CLIENT_ID=123456789-abcdefghijklmnop.apps.googleusercontent.com
```

### ❌ NEVER: Commit .env Files with Real Values

Even if .gitignored later, they may already be in history.

## Template Files

Always provide template files with placeholder values:

**vue-ui/.env.template**:
```bash
# Google OAuth Configuration
VITE_GOOGLE_CLIENT_ID=your-google-client-id-here
VITE_GOOGLE_API_KEY=your-google-api-key-here

# Instructions:
# 1. Copy this file to .env.local
# 2. Replace placeholder values with actual credentials
# 3. Never commit .env.local to Git
```

## .gitignore Best Practices

Ensure your .gitignore includes:

```gitignore
# Environment files with secrets
.env
.env.local
.env.*.local
.env.production
.env.development
.env.deploy

# Secret files
*.secret
*.pem
*.key
credentials.json

# API keys
*_api_key*
*_secret*
```

## If a Secret is Exposed

1. **Rotate Immediately** - Generate new credentials and revoke the old ones
2. **Review Git History** - Check all commits for exposed secrets
3. **Use Git Tools** - Consider using `git-filter-repo` or BFG Repo-Cleaner to remove from history
4. **Force Push Warning** - Rewriting history requires force pushing and coordinating with team
5. **Monitor for Abuse** - Check for unauthorized usage of exposed credentials

## Deployment Script Checklist

Before committing any deployment script:

- [ ] No hardcoded passwords or API keys
- [ ] Environment variables are checked before use
- [ ] Clear error messages guide users on how to set secrets
- [ ] Template files show required configuration structure
- [ ] README documents how to configure secrets
- [ ] .gitignore prevents accidental commits of secret files

## Quick Reference: Current Project

### Required Environment Variables

For `deploy-to-droplet.sh`:
```bash
export VITE_GOOGLE_CLIENT_ID='your-client-id'
export VITE_GOOGLE_API_KEY='your-api-key'
```

### Template Files
- `vue-ui/.env.template` - Frontend environment template
- `src/api-server/.env.template` - Backend environment template

### Protected Files (.gitignore)
- `vue-ui/.env.local`
- `vue-ui/.env`
- `src/api-server/.env`
- Any file matching `*.secret` or `*_key*`

## Learning Resources

- [OWASP: Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [GitHub: Removing sensitive data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- [12 Factor App: Config](https://12factor.net/config)

---

**Remember**: Secrets in code = Security incident. Always use environment variables or external secret management.
