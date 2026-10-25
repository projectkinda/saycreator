// The mock path for carousels (the old template draft from src/engine) stays available behind a flag, for demos and tests.
// Turn it on with VITE_MOCK_CAROUSEL=1 when starting the app, or in the browser console: localStorage.setItem('creator.mockCarousel', '1').
export function mockCarousel(): boolean {
  if (import.meta.env.VITE_MOCK_CAROUSEL === '1') return true;
  try {
    return localStorage.getItem('creator.mockCarousel') === '1';
  } catch {
    return false;
  }
}
