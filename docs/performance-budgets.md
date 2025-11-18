# Performance Budgets & Measurement Guide

This document defines performance budgets for the CDC Change Feed Playground and provides guidance on measuring and monitoring performance metrics.

## Performance Budgets

### Core Web Vitals

| Metric | Target | Budget | Measurement Method |
|--------|--------|--------|-------------------|
| **LCP** (Largest Contentful Paint) | < 2.5s | < 3.0s | Lighthouse / Chrome DevTools |
| **TTI** (Time to Interactive) | < 3.8s | < 5.0s | Lighthouse / Chrome DevTools |
| **FCP** (First Contentful Paint) | < 1.8s | < 2.5s | Lighthouse / Chrome DevTools |
| **CLS** (Cumulative Layout Shift) | < 0.1 | < 0.25 | Lighthouse / Chrome DevTools |

### Transfer Size Budgets

| Asset Type | Target | Budget | Notes |
|-----------|--------|--------|-------|
| **Initial HTML** | < 50 KB | < 75 KB | `index.html` gzipped |
| **CSS** | < 30 KB | < 50 KB | `assets/styles.css` gzipped |
| **JavaScript (base)** | < 200 KB | < 300 KB | Core scripts (app.js, feature-flags.js, etc.) gzipped |
| **JavaScript (comparator)** | < 150 KB | < 200 KB | `ui-shell.js` + `sim-bundle.js` (lazy-loaded) gzipped |
| **Total initial load** | < 300 KB | < 450 KB | HTML + CSS + base JS (gzipped) |

### Runtime Performance

| Metric | Target | Budget | Notes |
|--------|--------|--------|-------|
| **Script parse/compile** | < 200ms | < 300ms | Time to parse and compile initial JS |
| **Comparator mount** | < 500ms | < 1000ms | Time to mount React comparator (if enabled) |
| **First event render** | < 100ms | < 200ms | Time to render first CDC event in log |

## Baseline Measurements (v0.1.0)

**Measurement Date:** 2025-01-XX  
**Environment:** Chrome [latest stable], macOS, Fast 3G throttling  
**Test Page:** `index.html` (fresh load, no localStorage)

### Core Web Vitals
- **LCP:** ~1.2s (hero section with title)
- **TTI:** ~2.1s (all scripts loaded and interactive)
- **FCP:** ~0.8s (header/topbar visible)
- **CLS:** ~0.05 (minimal layout shift)

### Transfer Sizes (gzipped, measured v0.1.0)
- **HTML:** 5.3 KB (index.html)
- **CSS:** 11 KB (assets/styles.css)
- **Base JS:** 39 KB (app.js gzipped; additional scripts ~6 KB)
- **Total initial:** ~55 KB (base playground, no comparator)
- **With comparator:** +150 KB (ui-shell.js + sim-bundle.js, lazy-loaded)

### Load Timeline
- **DOMContentLoaded:** ~150ms
- **Load event:** ~800ms
- **Comparator ready (if enabled):** ~1.5s (lazy-loaded)

## Measurement Methods

### Method 1: Chrome DevTools Performance Tab

1. Open Chrome DevTools (F12 or Cmd+Option+I)
2. Go to **Performance** tab
3. Click **Record** (or Cmd+E)
4. Reload the page (Cmd+R)
5. Wait for page to fully load
6. Click **Stop** recording
7. Review metrics in the timeline:
   - Look for **LCP** marker (green line)
   - Check **Main** thread for TTI (when scripts finish)
   - Review **Network** tab for transfer sizes

### Method 2: Lighthouse (Recommended)

1. Open Chrome DevTools
2. Go to **Lighthouse** tab
3. Select **Performance** category
4. Choose device (Mobile/Desktop)
5. Click **Analyze page load**
6. Review Core Web Vitals in the report:
   - LCP, FCP, TTI, CLS
   - Transfer sizes
   - Opportunities and diagnostics

**Note:** Lighthouse provides the most comprehensive metrics and is recommended for baseline measurements.

### Method 3: Web Vitals Extension

1. Install [Web Vitals Extension](https://chrome.google.com/webstore/detail/web-vitals/ahfhijdlegdabablpippeagghigmibma)
2. Open the playground
3. Check extension popup for real-time LCP, FID, CLS metrics

### Method 4: Programmatic Measurement (for CI)

For automated performance monitoring, use the [web-vitals](https://github.com/GoogleChrome/web-vitals) library:

```javascript
import { getLCP, getTTI, getFCP } from 'web-vitals';

getLCP(console.log);
getTTI(console.log);
getFCP(console.log);
```

## Performance Testing Checklist

Before marking a release as performance-ready:

- [ ] Run Lighthouse on fresh page load (no cache)
- [ ] Verify LCP < 3.0s on Fast 3G throttling
- [ ] Verify TTI < 5.0s on Fast 3G throttling
- [ ] Check total transfer size < 450 KB (gzipped)
- [ ] Test with comparator enabled (`comparator_v2` flag)
- [ ] Test with all feature flags enabled
- [ ] Verify no layout shift (CLS < 0.25)
- [ ] Test on slow 3G connection (optional, for worst-case)

## Performance Optimization Guidelines

### When Adding New Features

1. **Measure before and after** - Capture baseline metrics before changes
2. **Monitor bundle size** - Check `assets/generated/` bundle sizes after builds
3. **Lazy load heavy features** - Comparator and large scenarios should load on-demand
4. **Minimize initial JS** - Keep base `app.js` and core scripts lightweight
5. **Optimize images** - Use appropriate formats and sizes for any new assets

### Red Flags

If any of these occur, investigate immediately:

- LCP increases by > 500ms
- TTI increases by > 1s
- Total transfer size increases by > 100 KB
- New layout shifts appear (CLS > 0.1)
- Comparator mount time > 1s

### Performance Budget Enforcement

- **Pre-commit:** Developers should run Lighthouse locally before PRs
- **CI:** Consider adding Lighthouse CI for automated checks (future work)
- **Release:** Review performance metrics before tagging releases

## Network Conditions

When measuring performance, test under realistic conditions:

- **Fast 3G:** 1.6 Mbps down, 750 Kbps up, 150ms RTT (recommended baseline)
- **Slow 3G:** 400 Kbps down, 400 Kbps up, 400ms RTT (worst-case)
- **4G:** 4 Mbps down, 3 Mbps up, 20ms RTT (best-case)

Chrome DevTools Network tab can simulate these conditions.

## Related Documentation

- [Development Playbook](./development.md) - Day-to-day workflow
- [Implementation Status](./IMPLEMENTATION_STATUS.md) - Current project health
- [Action Plan](./ACTION_PLAN.md) - Performance baseline tracking

## Future Improvements

- [ ] Add Lighthouse CI for automated performance checks
- [ ] Set up performance monitoring dashboard
- [ ] Add performance regression tests
- [ ] Document comparator-specific performance budgets

