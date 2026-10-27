// Which missing tools how many references need. Pure, with no imports from the engine, so tests and the Results screen can use it.
import type { MissingTool } from './types';

/** The missing tools of several runs, most-needed first: how many references need each one. */
export function rankMissing(runs: { name: string; missing: MissingTool[] }[]): { tool: string; count: number; references: string[]; why: string }[] {
  const by = new Map<string, { tool: string; refs: Set<string>; why: string }>();
  const key = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  for (const r of runs)
    for (const m of r.missing) {
      const k = key(m.tool);
      const e = by.get(k) ?? { tool: m.tool, refs: new Set<string>(), why: m.why };
      e.refs.add(r.name);
      by.set(k, e);
    }
  return [...by.values()].map((e) => ({ tool: e.tool, count: e.refs.size, references: [...e.refs], why: e.why })).sort((a, b) => b.count - a.count || a.tool.localeCompare(b.tool));
}
