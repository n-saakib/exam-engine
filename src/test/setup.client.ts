import "@testing-library/jest-dom/vitest";

/**
 * jsdom doesn't implement matchMedia; the no-FOUC theme logic and any
 * prefers-color-scheme reads need a stub so client renders don't throw.
 */
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
