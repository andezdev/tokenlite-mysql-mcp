# Contributing to TokenLite MySQL MCP

First off, thank you for considering contributing to TokenLite! It's people like you that make the open source community such a fantastic place to learn, inspire, and create.

This project enforces strict quality and semantic standards to ensure maximum safety and reliability. Please read these guidelines before you start coding.

## 🛠️ Local Development Setup

1. Fork and clone the repository.
2. Ensure you have **Node.js 20+** and **Docker** installed.
3. Install dependencies:
   ```bash
   npm install
   ```
   *(Note: This will automatically install our local Git Hooks via Husky).*
4. Build the TypeScript code:
   ```bash
   npm run build
   ```

## ✅ Running Tests

**You must ensure all tests pass before submitting a Pull Request.**

1. Start the MySQL testing container:
   ```bash
   docker-compose -f docker/docker-compose.yml up -d
   ```
2. Run Vitest:
   ```bash
   npm test
   ```

## 📝 Commit Message Standard (MANDATORY)

To fully automate our changelog generation and NPM versioning, this repository uses Google's **Release Please** bot. 

Because of this, **all commits MUST follow the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification**. If you write a malformed commit, our local Husky `commit-msg` hook will block you from saving it.

### Allowed Commit Types
- `feat:` A new feature (Triggers a **MINOR** release).
- `fix:` A bug fix (Triggers a **PATCH** release).
- `docs:` Documentation changes only (README, AGENTS.md, etc.).
- `chore:` Changes to the build process, CI/CD, or auxiliary tools.
- `refactor:` A code change that neither fixes a bug nor adds a feature.
- `test:` Adding missing tests or correcting existing tests.
- `perf:` A code change that improves performance.

### Breaking Changes
If your change breaks backward compatibility (e.g., changing an environment variable name, removing a tool), you **MUST** indicate this to trigger a **MAJOR** release. You can do this by appending a `!` after the type:
```bash
git commit -m "feat!: removed the legacy templates logic"
```

## 🚀 Pull Request Process

1. Create a new branch from `main` (e.g., `feat/my-new-tool` or `fix/optimizer-bug`).
2. Write your code and ensure you add tests for it in the `tests/` directory.
3. Commit using Conventional Commits. *(Our pre-commit hook will automatically run `npm test` to ensure you didn't break anything).*
4. Push your branch and open a Pull Request against `main`.
5. Wait for the automated CI/CD checks (GitHub Actions) to pass.
6. A maintainer will review your code. Once merged, the Release Please bot will automatically handle the versioning and NPM deployment.

