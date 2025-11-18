# Feature Flag Activation Governance

## Summary
This document defines the activation plan, verification checklist, and rollback procedures for feature flags in the CDC Change Feed Playground. It ensures disciplined rollout of new features with clear acceptance criteria and safety measures.

## Motivation
We need a clear process for enabling feature flags to avoid:
- Conflicting toggles or surprise UX shifts
- Regressions in production
- Documentation drift
- Unclear rollback procedures

## Feature Flag Inventory

### Current Status (as of latest update)

| Flag | Default State | Dependencies | UI Coverage | Notes |
|------|--------------|--------------|-------------|-------|
| `comparator_v2` | ✅ Enabled | None | Full comparator UI | Production-ready, validated |
| `ff_crud_fix` | ✅ Enabled | None | CRUD operations | Core functionality |
| `ff_event_log` | ✅ Enabled | None | Event log panel | Core functionality |
| `ff_event_bus` | ✅ Enabled | None | Event bus column | Core functionality |
| `ff_pause_resume` | ✅ Enabled | `ff_event_bus` | Pause/resume controls | Core functionality |
| `ff_query_slider` | ✅ Enabled | None | Polling interval slider | Core functionality |
| `ff_schema_demo` | ✅ Enabled | None | Schema walkthrough UI | Validated, tests passing |
| `ff_multitable` | ✅ Enabled | None | Multi-table scenarios | Validated, tests passing |
| `ff_metrics` | ✅ Enabled | None | Metrics dashboard | Validated, tests passing |
| `ff_trigger_mode` | ⚠️ Not enabled | Write amplification UI | Trigger adapter + metrics | Pending UI completion |
| `ff_walkthrough` | ⚠️ Not enabled | Content review | Guided tour | Pending content review |

## Pre-Flight Checklist

Before promoting any flag to default-on, complete these checks:

### 1. Code Readiness
- [ ] Implementation is complete and tested
- [ ] Unit tests cover the feature (if applicable)
- [ ] No known blocking bugs
- [ ] Code review completed

### 2. Testing
- [ ] Run `npm run build` - verify no build errors
- [ ] Run `npm run test:unit` - all tests passing
- [ ] Run `npm run test:sim` - property tests passing
- [ ] Run `npm run test:e2e` - E2E tests passing (or known issues documented)
- [ ] Manual smoke test: feature works as expected
- [ ] Test with flag disabled: graceful degradation works

### 3. Documentation
- [ ] Update `docs/feature-flags.md` with flag status
- [ ] Update `docs/next-steps.md` if flag was tracked there
- [ ] Add/update any user-facing documentation
- [ ] Document any breaking changes or migration needs

### 4. Integration
- [ ] Verify flag doesn't conflict with other enabled flags
- [ ] Check telemetry/metrics are working (if applicable)
- [ ] Verify bundle sizes are acceptable
- [ ] Test in different browsers (if applicable)

## Activation Order

### Recommended Sequence for Remaining Flags

1. **`ff_walkthrough`** (P1)
   - **Prerequisites:** Content review complete, tour flow validated
   - **Risk:** Low - UI-only, can be disabled easily
   - **Dependencies:** None
   - **Rollback:** Remove from `index.html` feature flags arrays

2. **`ff_trigger_mode`** (P1)
   - **Prerequisites:** Write amplification UI complete, tests passing
   - **Risk:** Medium - Adds new CDC mode, affects comparator behavior
   - **Dependencies:** Write amplification metrics UI
   - **Rollback:** Remove from `index.html` feature flags arrays

### Activation Steps

1. **Local Validation**
   ```bash
   # Enable flag locally in index.html
   # Test thoroughly
   npm run build
   npm run test:unit
   npm run test:e2e
   ```

2. **Update Documentation**
   - Mark flag as enabled in `docs/feature-flags.md`
   - Update `docs/next-steps.md` if applicable
   - Document any special considerations

3. **Commit and Deploy**
   - Add flag to both `APPWRITE_CFG.featureFlags` and `window.CDC_FEATURE_FLAGS` in `index.html`
   - Commit with clear message: `feat: enable ff_<flag_name> by default`
   - Monitor for issues after deployment

## Rollback Procedures

### Quick Rollback (Flag-Level)

**Location:** `index.html` lines 554-564 and 570-580

**Steps:**
1. Remove flag from `APPWRITE_CFG.featureFlags` array
2. Remove flag from `window.CDC_FEATURE_FLAGS` array
3. Commit: `revert: disable ff_<flag_name> due to <issue>`
4. Update `docs/feature-flags.md` to reflect disabled state

### Emergency Rollback (Runtime)

Users can disable flags via:
- Query parameter: `?flag=ff_<flag_name>` (to disable, remove from URL)
- Browser console: `window.cdcFeatureFlags.disable('ff_<flag_name>')`
- localStorage: Clear `cdc_feature_flags_v1` key

### Data Cleanup

Most flags don't require data cleanup. Exceptions:
- **`comparator_v2`**: No cleanup needed (telemetry stored locally)
- **`ff_metrics`**: No cleanup needed (metrics in-memory only)
- **`ff_walkthrough`**: No cleanup needed (tour state in localStorage, safe to ignore)

## Feature Flag Sources & Precedence

Flags are loaded from multiple sources in this order (later sources override earlier):

1. **`APPWRITE_CFG.featureFlags`** (index.html) - Primary source for defaults
2. **`window.CDC_FEATURE_FLAGS`** (index.html) - Fallback defaults
3. **`localStorage`** (`cdc_feature_flags_v1`) - User overrides
4. **Query parameters** (`?flag=...` or `?flags=...`) - URL overrides

**Important:** Once any source provides flags, it acts as an **allowlist**. Empty set means all features enabled by default.

## Telemetry Validation

For flags that emit telemetry:

1. **Unit Tests**
   ```bash
   npm run test:unit  # Should include telemetry tests
   ```

2. **Manual Verification**
   - Open browser console
   - Check `window.telemetry` buffer
   - Verify events are captured correctly

3. **Integration Checks**
   - Verify metrics appear in dashboard (if applicable)
   - Check that telemetry doesn't impact performance

## Maintenance

### Regular Reviews
- **Monthly:** Review flag status in `docs/feature-flags.md`
- **After major releases:** Audit enabled flags, consider removing flags that are stable
- **When adding new flags:** Update this governance doc

### Flag Lifecycle
1. **Development** - Flag exists, not in `index.html`
2. **Staging** - Flag in `index.html` but documented as experimental
3. **Production** - Flag enabled by default, documented as stable
4. **Deprecated** - Flag marked for removal, migration path documented
5. **Removed** - Flag code removed, no longer referenced

## Related Resources
- `docs/feature-flags.md` - Current flag matrix
- `docs/launch-readiness.md` - Rollout procedures
- `assets/feature-flags.js` - Flag loading implementation
- `src/engine/metrics.ts` - Telemetry hooks
