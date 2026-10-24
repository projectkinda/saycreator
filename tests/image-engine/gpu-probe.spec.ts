// Facts about this machine's Chrome: is WebGPU there, what are its limits, is the page cross-origin isolated?
import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../out/image-engine/step4');

test('probe: WebGPU, limits, isolation, cores', async ({ page }) => {
  await page.goto('/tests/image-engine/harness/index.html');
  const facts = await page.evaluate(async () => {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<{ info?: Record<string, string>; features: Set<string>; limits: Record<string, number> } | null> } }).gpu;
    let adapter: unknown = null;
    let error = '';
    if (gpu) {
      try {
        const a = await gpu.requestAdapter();
        const keys = ['maxStorageBuffersPerShaderStage', 'maxStorageBufferBindingSize', 'maxBufferSize', 'maxComputeWorkgroupStorageSize', 'maxComputeInvocationsPerWorkgroup', 'maxBindGroups', 'maxStorageBuffersInVertexStage'];
        adapter = a ? { info: { vendor: a.info?.vendor, architecture: a.info?.architecture }, shaderF16: a.features.has('shader-f16'), limits: Object.fromEntries(keys.map((k) => [k, a.limits[k]])) } : null;
      } catch (e) {
        error = String(e);
      }
    }
    return { userAgent: navigator.userAgent, hasNavigatorGpu: !!gpu, adapter, error, crossOriginIsolated, cores: navigator.hardwareConcurrency, deviceMemoryGB: (navigator as unknown as { deviceMemory?: number }).deviceMemory };
  });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'machine-probe.json'), JSON.stringify(facts, null, 2));
  console.log(JSON.stringify(facts));
});
