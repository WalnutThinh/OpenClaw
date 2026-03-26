/**
 * Stable folder name under ~/.openclaw/workspace/skills/ for a bundled skill id.
 * Uses path segments from id (forward slashes); spaces inside a segment become hyphens;
 * segments are joined with "--" so paths stay shell-safe (no spaces).
 *
 * Examples:
 * - "Office Task/Email" → "Office-Task--Email"
 * - "API/GATEWAY" → "API--GATEWAY"
 * - "Learning/self improving" → "Learning--self-improving"
 */
export const slugDestDir = (id: string): string =>
  id
    .replace(/\\/g, '/')
    .split('/')
    .map((seg) => seg.trim().replace(/\s+/g, '-'))
    .filter(Boolean)
    .join('--')

/** Legacy slug from older Enchante builds (only `/` → `--`, spaces kept). */
export const legacySlugDestDir = (id: string): string => id.replace(/[/\\]/g, '--')
