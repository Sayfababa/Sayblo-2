import { defineConfig } from 'vitest/config';

// tests only from this checkout, not from agent worktrees under .claude/
export default defineConfig({ test: { include: ['tests/**/*.test.ts'] } });
