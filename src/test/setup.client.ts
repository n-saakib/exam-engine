import "@testing-library/jest-dom/vitest";

/**
 * jsdom doesn't implement matchMedia; the no-FOUC theme logic and any
 * prefers-color-scheme reads need a stub so client renders don't throw.
 *
 * We implement the MODERN `addEventListener` / `removeEventListener` API
 * (MediaQueryList#addEventListener). The older `addListener` / `removeListener`
 * methods are deprecated and were removed from newer DOM lib defs; keeping
 * them in the stub would surface a noisy `ts(2802)` warning on the test
 * boundary. Both shapes are still exposed for any code that reaches for the
 * legacy API, but the modern pair is the real one.
 */
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    // Modern API — what production code uses.
    addEventListener: () => {},
    removeEventListener: () => {},
    // Deprecated API — kept as a no-op shim for any pre-modern callers.
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
