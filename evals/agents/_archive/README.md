# Archived Eval Tests

**Status**: Archived (Legacy Structure)  
**Date Archived**: 2025-12-10  
**Reason**: Migrated to category-based structure

---

## What's Here

This directory contains the **legacy flat eval structure** that was used before the category-based agent system (v2.0.0).

### Archived Directories:
- `openagent/` - Legacy OpenAgent eval tests (14 test suites)
- `opencoder/` - Legacy OpenCoder eval tests

---

## Current Structure

The new category-based eval structure is located at:

```
evals/agents/
├── core/
│   ├── openagent/      # ← New location
│   ├── opencoder/      # ← New location
│   └── system-builder/
├── development/
│   ├── frontend-specialist/
│   └── backend-specialist/
└── content/
    └── copywriter/
```

---

## Why Archived?

1. **Category-based organization** - Agents are now organized by domain (core, development, content, etc.)
2. **Simplified structure** - New tests use standardized smoke tests
3. **Backward compatibility** - Old tests preserved here for reference

---

## Using Archived Tests

If you need to reference or migrate tests from the legacy structure:

1. **View test structure**: Browse the archived directories
2. **Migrate tests**: Copy relevant tests to new category-based locations
3. **Update paths**: Change agent paths from `openagent` to `core/openagent`

---

## Migration Notes

The legacy tests were comprehensive but used an older structure. New tests should:
- Use category-based agent paths (`core/openagent`, not `openagent`)
- Follow the standardized test format
- Be placed in the appropriate category directory

---

**For questions about test migration, see**: `docs/contributing/CONTRIBUTING.md`
