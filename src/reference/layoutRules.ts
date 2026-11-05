// A style's layouts.<type> is a list of rules; the LAST rule is the fallback and must have no "when" (the validator in image-engine/styles/format.ts says so).
// Whoever rewrites a list goes through withFallback, so a rewrite can never leave a conditional rule last. Nothing here mutates its input.
import { blankStyle } from './blank';

export interface LayoutRule {
  use: string;
  when?: Record<string, unknown>;
  [k: string]: unknown;
}

/** The rules, with a last rule that has no "when": when the last one has a condition, {use: defaultUse} is added after it. A well-formed list comes back as it is. */
export function withFallback<T extends { use: string; when?: unknown }>(rules: readonly T[], defaultUse: string): (T | { use: string })[] {
  if (rules.length === 0) return [{ use: defaultUse }];
  return rules[rules.length - 1].when !== undefined ? [...rules, { use: defaultUse }] : [...rules];
}

/** The same normaliser over every layouts.<type> list of a style (the safety net before the validator). The default fallback per type is the base style's own last rule. */
export function normaliseLayouts<L extends Record<string, readonly { use: string; when?: unknown }[]>>(layouts: L): L {
  const base = blankStyle().layouts as unknown as Record<string, { use: string }[]>;
  const out: Record<string, unknown> = {};
  for (const [type, rules] of Object.entries(layouts)) {
    const fallback = base[type]?.[base[type].length - 1]?.use ?? rules[rules.length - 1]?.use ?? 'cover-stack';
    out[type] = Array.isArray(rules) ? withFallback(rules, fallback) : rules;
  }
  return out as L;
}
