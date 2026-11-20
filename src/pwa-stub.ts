/** Stand-in for the PWA registration in builds that cannot use a service worker (the claude.ai artifact). */
export function registerSW(_opts?: unknown) { return () => Promise.resolve(); }
