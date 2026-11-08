// The website the person has set in their profile / brand settings (Branding > Website: the first brand kit's website address). Empty when none is set: the footer then draws no website line.
import { loadWorkspaces } from '../pages/branding/workspace';

export function profileWebsite(): string {
  try {
    return (loadWorkspaces('', '')[0]?.websiteUrl ?? '').trim();
  } catch {
    return '';
  }
}
