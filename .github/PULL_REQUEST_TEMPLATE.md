## 📌 Description
<!-- Provide a concise summary of the changes introduced in this PR -->

## 🔗 Related Ticket
Closes #<ticket-number>

## 🛠 Type of Change
- [ ] ✨ `feat` (New feature)
- [ ] 🐛 `fix` (Bug fix)
- [ ] ♻️ `refactor` (Code refactoring)
- [ ] ⚙️ `chore` (Configuration / Build update)
- [ ] 📝 `docs` (Documentation updates)

## 📋 Architectural & Quality Checklist
- [ ] 🎯 **Domain Layer Isolation:** No framework-specific or database code imported in `src/domain/`.
- [ ] 🔌 **Ports & Adapters:** Infrastructure injected using interface tokens.
- [ ] 🏢 **Multi-Tenant Safety:** All database operations strictly include `tenantId`.
- [ ] 🧪 **Testing:** Unit tests added/updated for Use Cases.
- [ ] 🟢 **Verification:** `npm run lint` and `npm run test` pass cleanly.

## 🖼 Screenshots / Logs (if applicable)
