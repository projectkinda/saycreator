// Every image-engine spec except the ones that call a real model ("*-real.spec.ts" need a key and cost money): one run, no serial files, 20 s per click.
import base from './playwright.config';
import { defineConfig } from '@playwright/test';
export default defineConfig({ ...base, testIgnore: ['**/*-real.spec.ts', '**/gpu-probe.spec.ts'] });
