// Compat for specs written before the stepped page (UI Round 1): they look for controls that used to be on one page (the Advanced fold, the style list, the Make button, the options).
// `showAllSteps` makes the four step panels (and nothing else) visible at once, so such a spec still finds each control; it keeps what the spec checks, it does not test the wizard
// (ui-round-1 to ui-round-4 do that). A control that is no longer on the page at all (the Advanced fold, one card per slide) is NOT brought back by this.
import type { Page } from '@playwright/test';

export async function showAllSteps(page: Page) {
  await page.addInitScript(() => {
    const css = '.cr-studio .cr-wiz-body [hidden] { display: revert !important; } .cr-studio .cr-wiz-body > div[hidden] { display: block !important; }';
    const add = () => { const s = document.createElement('style'); s.setAttribute('data-test-flat', '1'); s.textContent = css; document.head.appendChild(s); };
    if (document.head) add(); else document.addEventListener('DOMContentLoaded', add);
  });
}
