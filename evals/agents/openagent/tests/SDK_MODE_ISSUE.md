# SDK Mode Issue - Session Creation Failure

**Status**: 🔴 BROKEN - SDK mode disabled  
**Date**: Nov 26, 2024  
**Affected Commit**: 9949220

## Problem

SDK mode causes session creation failures with error:
```
Failed to create session: No data in response
```

## Background

### Commit 9949220 (Nov 26, 22:16)
**Title**: "fix(evals): enable SDK mode for server when agent is specified"

**Intent**:
- Use `@opencode-ai/sdk`'s `createOpencode()` instead of spawning CLI
- Avoid needing to install OpenCode CLI in CI/CD
- Simplify GitHub Actions workflow

**Changes**:
1. Modified `server-manager.ts`: `this.useSDK = !!config.agent`
2. Removed CLI installation steps from `.github/workflows/test-agents.yml`

**Result**: ❌ All tests started failing with session creation errors

## Root Cause

The SDK's `session.create()` method returns `response.data = undefined`:

```typescript
// In client-manager.ts line 80-88
const response = await this.client.session.create({
  body: {
    title: config.title || `Eval Session ${new Date().toISOString()}`,
  },
});

if (!response.data) {
  throw new Error('Failed to create session: No data in response');
}
```

**Why this happens**: Unknown - needs investigation into `@opencode-ai/sdk` package

## Current Solution

**Disabled SDK mode** - Always use manual spawn:

```typescript
// server-manager.ts line 23-40
constructor(private config: ServerConfig = {}) {
  this.port = config.port || 0;
  this.hostname = config.hostname || '127.0.0.1';
  
  // IMPORTANT: SDK mode is currently broken
  // Always use manual spawn until SDK mode is fixed
  this.useSDK = false;
}
```

**GitHub Actions**: Re-added CLI installation via `npm install -g opencode-ai`

## Testing Results

### Local Development
- **Manual spawn** (useSDK = false): ✅ Works perfectly
- **SDK mode** (useSDK = true): ❌ Session creation fails

### CI Environment (CI=true)
- **Manual spawn**: ✅ Should work (CLI installed via npm)
- **SDK mode**: ❌ Session creation fails (same error)

## Impact

### What Works ✅
- Local test execution
- GitHub Actions (with CLI installation)
- All 22 migrated tests
- New folder structure

### What's Broken ❌
- SDK mode session creation
- Original intent of commit 9949220 (avoid CLI dependency)

### Workaround ✅
- GitHub Actions now installs CLI: `npm install -g opencode-ai`
- Tests use manual spawn method
- Everything works, just requires CLI installation

## Investigation Needed

1. **Check SDK version**: Is `@opencode-ai/sdk` version compatible?
   ```bash
   npm list @opencode-ai/sdk
   # Currently: ^1.0.90
   ```

2. **Test SDK directly**: Can we create sessions with SDK outside test framework?
   ```typescript
   import { createOpencode } from '@opencode-ai/sdk';
   const opencode = await createOpencode({ port: 0 });
   const session = await opencode.client.session.create({ body: { title: 'Test' } });
   console.log(session.data); // Is this undefined?
   ```

3. **Check SDK source**: What does `session.create()` actually return?
   - Look at `@opencode-ai/sdk` source code
   - Check if API changed
   - Verify response format

4. **Environment differences**: Why might it work in CI but not locally?
   - API keys?
   - Network configuration?
   - SDK initialization?

## Proposed Fix (Future)

Once SDK mode is fixed, use this logic:

```typescript
constructor(private config: ServerConfig = {}) {
  this.port = config.port || 0;
  this.hostname = config.hostname || '127.0.0.1';
  
  const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
  
  // Use SDK in CI (no CLI dependency), manual spawn locally
  this.useSDK = isCI && !!config.agent;
}
```

**Benefits**:
- CI/CD doesn't need CLI installation
- Local development uses reliable manual spawn
- Best of both worlds

## Files Modified

1. `evals/framework/src/sdk/server-manager.ts`
   - Disabled SDK mode
   - Added comprehensive documentation

2. `.github/workflows/test-agents.yml` (already has CLI installation)
   - Lines 82-86: Install OpenCode CLI via npm
   - Lines 131-135: Same for opencoder tests

## Related Issues

- Commit 9949220: Introduced SDK mode
- Commit 6ee3a69: Disabled SDK mode (this fix)

## Next Steps

1. ⬜ Investigate SDK session creation issue
2. ⬜ Test SDK directly outside framework
3. ⬜ Check SDK version compatibility
4. ⬜ Review SDK source code
5. ⬜ Once fixed, re-enable SDK mode for CI
6. ⬜ Remove CLI installation from GitHub Actions

## References

- Original commit: 9949220
- Fix commit: 6ee3a69
- SDK package: `@opencode-ai/sdk` v1.0.90
- Error location: `evals/framework/src/sdk/client-manager.ts:87`
