import type { Patch, PatchResult, Plan, RenderReport } from './types';

export interface ExportOptions {
  format: 'png' | 'jpeg';
  /** 1 = the plan's own size. 0.25 is a quarter-size copy. */
  scale: number;
  /** jpeg only, 0 to 1 */
  quality?: number;
}

/**
 * The only thing the rest of the engine knows about drawing. Fabric.js is the first implementation;
 * nothing outside fabric-adapter.ts may import Fabric.
 *
 * Canvas events never change state. They *propose* patches through onPatchRequest; whoever owns the
 * plan applies (or rejects) them and calls render again.
 */
export interface CanvasAdapter {
  /** Pass an element to show an editable canvas, or null to draw off screen. */
  mount(el: HTMLElement | null): Promise<void>;
  /** Draws the plan once fonts and images have loaded. Throws if the plan itself is invalid. */
  render(plan: Plan): Promise<RenderReport>;
  /** Validates and applies the patch to the current plan, then redraws. */
  applyPatch(patch: Patch): Promise<PatchResult>;
  export(opts: ExportOptions): Promise<Blob>;
  select(layerId: string | null): void;
  onPatchRequest(handler: (patch: Patch) => void): () => void;
  onSelect(handler: (layerId: string | null) => void): () => void;
  readonly plan: Plan | null;
  readonly lastReport: RenderReport | null;
  dispose(): void;
}
