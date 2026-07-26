# 🤝 Contributing Guidelines

Welcome to the Multi-Tenant Invoice SaaS Platform contribution guide! Please adhere to the guidelines below to ensure quality and architectural consistency.

---

## 🌿 Branching Strategy

- **Feature Branch:** `feature/<issue-id>-short-description` branched off `develop`.
- **Bug Fix Branch:** `fix/<issue-id>-short-description` branched off `develop`.
- **Target Branch:** Pull Requests must always target the `develop` branch (only releases merge to `main`).

---

## 📝 Commit Convention

We strictly follow Conventional Commits standard:

- `feat:` A new feature for the application.
- `fix:` A bug fix in existing code.
- `refactor:` Code changes that neither fix a bug nor add a feature.
- `chore:` Updating build tasks, configuration, dependencies.
- `test:` Adding missing tests or correcting existing tests.
- `docs:` Documentation only changes.

Example:
```bash
git commit -m "feat(invoice): add CreateInvoiceUseCase with tenant verification"
```

---

## 🚨 Architecture Rules (Clean Architecture)

- 🚫 **Domain Layer Isolation:** The Domain layer (`src/domain/`) must **NEVER** import `@nestjs/*`, `prisma`, or any infrastructure framework dependencies.
- 🔌 **Ports & Adapters:** The Application layer must interact with Infrastructure services using **Interface Tokens (Ports)**, never concrete implementation classes.
- 🏢 **Multi-Tenant Safety:** All repository database queries must include `tenantId` filtering without exception.

---

## 📋 Pre-PR Checklist

Before opening a Pull Request:
- [ ] Run `npm run lint` and verify zero lint errors.
- [ ] Run `npm run test` and ensure all unit tests pass.
- [ ] Rebase your branch against the latest `develop`.
