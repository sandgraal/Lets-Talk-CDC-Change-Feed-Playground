# Action Plan - Implementation Review Follow-up
**Created:** 2025-11-16  
**Review Reference:** [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md)

---

## Quick Summary

This document outlines concrete actions to take based on the implementation status review. All items are prioritized and include effort estimates and success criteria.

**Status:** 🟢 Project is healthy - focus on completing rollout and hardening

---

## ✅ Completed Actions (This Review)

1. **Comprehensive implementation review** ✅
   - Created detailed IMPLEMENTATION_STATUS.md
   - Identified strengths and gaps
   - Prioritized action items

2. **Security vulnerability fix** ✅
   - Fixed koa moderate severity vulnerability via npm audit fix
   - All tests still passing after fix
   - Zero vulnerabilities remaining

3. **Documentation sync** ✅
   - Updated feature-flags.md to match index.html reality
   - Updated next-steps.md with current priorities
   - Created this action plan

---

## 🎯 Phase 1: Critical Fixes (Complete This Week)

### 1. Fix Harness CI Docker Certificate Issue
**Priority:** P0  
**Effort:** 2-3 hours  
**Owner:** Dev team

**Problem:**
```
Error: self-signed certificate in certificate chain
Location: npm ci in Docker verifier/generator containers
Impact: Cannot run automated multi-engine validation
```

**Actions:**
- [ ] Investigate npm certificate chain error in Docker context
- [ ] Try adding `.npmrc` with `strict-ssl=false` to harness containers (temporary fix)
- [ ] Update base Docker images to latest stable versions
- [ ] Test with `cd harness && make up` locally
- [ ] Verify `npm run ci:harness` passes in CI
- [ ] Document certificate setup for contributors

**Success Criteria:**
- `npm run ci:harness` runs successfully
- Harness Nightly workflow passes
- Documentation updated with certificate troubleshooting

**Files to Update:**
- `harness/Dockerfile` (verifier/generator)
- `harness/README.md` or `docs/harness-guide.md`

---

### 2. Complete Comparator v2 Rollout Readiness
**Priority:** P0  
**Effort:** 3-4 hours  
**Owner:** Dev team

**Actions:**
- [ ] Run extended soak test with comparator_v2 enabled
  - Test all scenarios from scenario matrix
  - Exercise pause/resume, schema changes, transactions
  - Validate metrics dashboard accuracy
  
- [ ] Complete launch readiness checklist items:
  - [ ] Confirm comparator diff overlays work without regressions
  - [ ] Validate Playwright smoke tests pass
  - [ ] Run lane checks summary and inspect CTA
  - [ ] Verify documentation matches UI terminology
  
- [ ] Update release notes:
  - [ ] Add any final highlights to `docs/enablement/release-notes.md`
  - [ ] Document any known issues or limitations
  - [ ] Update troubleshooting tips
  
- [ ] Plan rollback procedure:
  - [ ] Document how to disable comparator_v2 if needed
  - [ ] Test rollback locally
  - [ ] Update `docs/launch-readiness.md` with procedure

**Success Criteria:**
- All items in `docs/issues/comparator-v2-rollout.md` checked off
- Soak test findings documented in `docs/post-launch-feedback.md`
- Rollback procedure tested and documented
- Team confident in comparator_v2 as default

**Reference:** `docs/issues/comparator-v2-rollout.md`

---

### 3. Document Current Implementation Status
**Priority:** P0  
**Effort:** 1 hour (mostly done!)  
**Owner:** Dev team

**Actions:**
- [x] Create comprehensive IMPLEMENTATION_STATUS.md ✅
- [x] Update next-steps.md with findings ✅
- [x] Sync feature-flags.md with reality ✅
- [ ] Add link to IMPLEMENTATION_STATUS.md in README.md
- [ ] Share review findings with team

**Success Criteria:**
- Status document accessible to all team members
- README includes link to status doc
- Next steps clearly communicated

---

## 🚀 Phase 2: Feature Rollout (Next 1-2 Weeks)

### 4. Enable and Validate ff_walkthrough
**Priority:** P1  
**Effort:** 4-5 hours  
**Owner:** Dev team

**Actions:**
- [ ] Content review for guided walkthrough:
  - [ ] Review all tooltip copy for accuracy
  - [ ] Check glossary terms match current terminology
  - [ ] Validate tour ordering makes sense
  - [ ] Test walkthrough flow end-to-end
  
- [ ] Technical validation:
  - [ ] Add ff_walkthrough to index.html featureFlags array
  - [ ] Run full test suite to ensure no regressions
  - [ ] Test localStorage persistence of walkthrough state
  - [ ] Verify tooltips can be toggled off
  
- [ ] Documentation:
  - [ ] Update feature-flags.md to show ff_walkthrough enabled
  - [ ] Add walkthrough to user guide if not already present
  - [ ] Update content-review-checklist.md

**Success Criteria:**
- Walkthrough flows naturally for new users
- All tooltip copy is accurate and helpful
- Feature flag enabled in index.html
- Tests passing with flag enabled

**Reference:** `docs/feature-flags.md`, `docs/content-review-checklist.md`

---

### 5. Plan and Enable ff_trigger_mode
**Priority:** P1  
**Effort:** 6-8 hours  
**Owner:** Dev team

**Actions:**
- [ ] Complete trigger write amplification UI work:
  - [ ] Surface write amplification metric in UI
  - [ ] Add guided walkthrough callouts for trigger mode
  - [ ] Update method comparison copy
  - [ ] Add visual indicators for extra writes
  
- [ ] Testing:
  - [ ] Add unit tests for trigger adapter telemetry
  - [ ] Add E2E test exercising trigger mode
  - [ ] Validate write amplification calculations
  
- [ ] Enable flag:
  - [ ] Add ff_trigger_mode to index.html
  - [ ] Update documentation
  - [ ] Run full test suite
  
- [ ] Documentation:
  - [ ] Update docs/issues/trigger-write-amplification.md
  - [ ] Add trigger mode examples to scenario matrix
  - [ ] Update feature-flags.md

**Success Criteria:**
- Write amplification clearly visible to users
- Trigger mode behaves correctly in all scenarios
- Documentation explains trade-offs well
- Tests cover trigger-specific behavior

**Reference:** `docs/issues/trigger-write-amplification.md`

---

### 6. Add Transaction Drift E2E Test
**Priority:** P1  
**Effort:** 4-6 hours  
**Owner:** Dev team

**Actions:**
- [ ] Design test scenario:
  - [ ] Define multi-table transaction operations
  - [ ] Identify expected vs actual outcomes with/without apply-on-commit
  - [ ] Document expected lane diff patterns
  
- [ ] Implement Playwright test:
  - [ ] Create test in `tests/e2e/transaction-drift.spec.mjs`
  - [ ] Test without apply-on-commit (show drift)
  - [ ] Test with apply-on-commit (show consistency)
  - [ ] Validate lane diff overlays show correct gaps
  - [ ] Assert on event ordering and lag metrics
  
- [ ] Add to CI:
  - [ ] Ensure test runs in preflight workflow
  - [ ] Document runtime considerations
  - [ ] Add to test suite documentation
  
- [ ] Close out issue:
  - [ ] Update docs/issues/transaction-drift-e2e.md
  - [ ] Mark as completed in next-steps.md

**Success Criteria:**
- Automated test catches transaction drift regressions
- Test runs reliably in CI (< 30 seconds)
- Documentation shows how to run test locally
- Issue marked complete

**Reference:** `docs/issues/transaction-drift-e2e.md`

---

## 📋 Phase 3: Enhancement & Planning (Next Month)

### 7. Feature Flag Governance Plan
**Priority:** P1  
**Effort:** 2-3 hours  
**Owner:** Dev team

**Actions:**
- [ ] Document activation process:
  - [ ] Pre-flight checklist template
  - [ ] Smoke test requirements
  - [ ] Documentation update checklist
  
- [ ] Define rollback procedures for each flag:
  - [ ] Technical steps to disable
  - [ ] Communication plan
  - [ ] Data cleanup if needed
  
- [ ] Set up telemetry validation:
  - [ ] Define success metrics per flag
  - [ ] Create monitoring dashboard (if needed)
  - [ ] Document how to validate telemetry
  
- [ ] Complete governance doc:
  - [ ] Fill in docs/issues/feature-flag-governance.md
  - [ ] Create activation sequence for remaining flags
  - [ ] Share with team for review

**Success Criteria:**
- Clear process for enabling/disabling any flag
- Rollback procedures tested
- Governance doc complete and reviewed

**Reference:** `docs/issues/feature-flag-governance.md`

---

### 8. Appwrite Integration Planning
**Priority:** P2  
**Effort:** 8-12 hours (design + prototyping)  
**Owner:** Dev team

**Actions:**
- [ ] Define requirements:
  - [ ] What data should persist? (scenarios, user prefs, session state)
  - [ ] Authentication approach (anonymous vs accounts)
  - [ ] Data retention policy
  
- [ ] Design storage helper interface:
  - [ ] API contract for storage operations
  - [ ] Fallback behavior when Appwrite unavailable
  - [ ] Migration path from localStorage
  
- [ ] Document configuration:
  - [ ] Environment variables needed
  - [ ] SDK initialization approach
  - [ ] How to toggle persistence on/off
  
- [ ] Create prototype:
  - [ ] Basic storage helper implementation
  - [ ] Demo with simple scenario persistence
  - [ ] Validate performance acceptable
  
- [ ] Update documentation:
  - [ ] Complete docs/issues/appwrite-persistence.md
  - [ ] Add configuration guide
  - [ ] Document testing approach

**Success Criteria:**
- Clear design documented
- Prototype demonstrates feasibility
- No breaking changes to in-memory mode
- Team aligned on approach

**Reference:** `docs/issues/appwrite-persistence.md`

---

### 9. Collect and Act on Usage Feedback
**Priority:** P1 (after rollout complete)  
**Effort:** Ongoing  
**Owner:** Dev team

**Actions:**
- [ ] Set up feedback collection:
  - [ ] Identify telemetry events to track
  - [ ] Create simple feedback form/mechanism
  - [ ] Monitor GitHub issues for user reports
  
- [ ] Plan feedback sessions:
  - [ ] Schedule 3 user walkthroughs
  - [ ] Prepare observation checklist
  - [ ] Document friction points
  
- [ ] Log findings:
  - [ ] Update docs/post-launch-feedback.md
  - [ ] Create issues for actionable items
  - [ ] Prioritize UX improvements
  
- [ ] Iterate:
  - [ ] Address quick wins immediately
  - [ ] Plan larger improvements for next sprint
  - [ ] Share learnings with team

**Success Criteria:**
- 3+ user sessions completed
- Feedback logged in post-launch-feedback.md
- Top 3 issues identified and prioritized
- At least 2 quick wins shipped

**Reference:** `docs/post-launch-feedback.md`

---

## 📊 Success Metrics

Track these metrics to measure progress:

### Quality Metrics
- [ ] Test coverage: Maintain 88+ unit tests, 6+ E2E tests
- [ ] Build success rate: 100% in CI
- [ ] Zero security vulnerabilities
- [ ] Documentation sync: feature-flags.md matches index.html

### Feature Rollout Metrics
- [ ] comparator_v2: Default in production
- [ ] ff_walkthrough: Enabled and validated
- [ ] ff_trigger_mode: Enabled and validated
- [ ] Transaction drift: E2E coverage added

### Operational Metrics
- [ ] Harness CI: Passing consistently
- [ ] E2E tests: < 10 second runtime
- [ ] Build time: < 2 seconds for both bundles

---

## 🔄 Review Schedule

**Weekly Check-ins:**
- Review action plan progress
- Update status for in-progress items
- Adjust priorities if needed

**Monthly Reviews:**
- Update IMPLEMENTATION_STATUS.md
- Review success metrics
- Plan next month's priorities

**Next Full Review:** 4 weeks after completing Phase 1 & 2

---

## 📚 Related Documents

- [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md) - Detailed status review
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) - Original v1.0 plan
- [next-steps.md](./next-steps.md) - Ongoing next steps tracking
- [feature-flags.md](./feature-flags.md) - Feature flag matrix
- [launch-readiness.md](./launch-readiness.md) - Launch readiness checklist
- [risk-register.md](./risk-register.md) - Known risks and mitigations

---

## ✋ When to Pause and Escalate

Stop and discuss with the team if:
- Security vulnerability discovered (severity: high or critical)
- Test pass rate drops below 90%
- Major architectural change needed
- External dependency blocking progress
- Timeline slipping by > 1 week

Otherwise, keep moving forward with this plan! 🚀
