// Test stub for the `server-only` package. In production `server-only` throws if
// imported from a Client Component bundle; under Vitest there is no RSC
// environment flag, so we alias it to this no-op so server modules import cleanly
// in the node test project. The real boundary is still enforced by `next build`.
export {};
