// The handle on the slides. Until the person types one, the script carries the placeholder "@yourname": that must never be DRAWN on a slide.
export const PLACEHOLDER_HANDLE = '@yourname';
/** The handle to draw: the one that is set, or '' (draw no handle at all) when it is empty or the placeholder. */
export const drawnHandle = (h?: string | null): string => (!h || /^@?yourname$/i.test(h.trim()) ? '' : h.trim());
