# Linting Setup

This document describes how to set up linting for the MCP Oracle Server project.

## ESLint Setup (Recommended)

### Installation

```bash
npm install --save-dev eslint
```

### Configuration

Create `.eslintrc.json`:

```json
{
  "env": {
    "node": true,
    "es2022": true
  },
  "extends": "eslint:recommended",
  "parserOptions": {
    "ecmaVersion": "latest",
    "sourceType": "module"
  },
  "rules": {
    "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
    "no-console": "off"
  }
}
```

### Usage

```bash
# Lint all files
npx eslint src/

# Fix auto-fixable issues
npx eslint src/ --fix
```

## Prettier Setup (Optional)

### Installation

```bash
npm install --save-dev prettier
```

### Configuration

Create `.prettierrc`:

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5"
}
```

### Usage

```bash
# Format all files
npx prettier --write "src/**/*.js"
```

## Pre-commit Hooks (Optional)

Use `husky` and `lint-staged` for pre-commit linting:

```bash
npm install --save-dev husky lint-staged
npx husky install
npx husky add .husky/pre-commit "npx lint-staged"
```

Create `.lintstagedrc.json`:

```json
{
  "*.js": ["eslint --fix", "prettier --write"]
}
```

