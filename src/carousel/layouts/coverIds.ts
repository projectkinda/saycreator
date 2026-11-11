// The cover family: layouts made for slide 1 only. The writer is never offered them (it picks a plain cover; the code gives the deck its cover from the style's own list, see flavour.ts).
export const COVER_LAYOUT_IDS = ['cover-centred', 'cover-index', 'cover-block', 'cover-sticker', 'cover-word', 'cover-ruled'] as const;
export type CoverLayoutId = (typeof COVER_LAYOUT_IDS)[number];
export const isCoverLayout = (id: string): boolean => (COVER_LAYOUT_IDS as readonly string[]).includes(id);
/** Every layout that can be a cover: the six of the family, the plain statement forms, and the lead-in statement. */
export const COVER_FORMS = ['statement', 'statement-stacked', 'statement-card', 'statement-pill', 'lead-statement', ...COVER_LAYOUT_IDS] as const;
