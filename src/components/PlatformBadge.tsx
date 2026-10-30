const keyOf = (channel: string) => channel.toLowerCase().replace(/\s+/g, '-');

function Mark({ channel }: { channel: string }) {
  const key = keyOf(channel);
  if (key === 'linkedin') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 8.2V18H3.2V8.2h3.2zM4.8 3.4a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8zM11.8 8.2v1.3h.1c.5-.9 1.7-1.8 3.5-1.8 3.4 0 4 2.1 4 5.2V18h-3.2v-4.6c0-1.4 0-3-1.9-3s-2.2 1.5-2.2 2.9V18H8.9V8.2h2.9z"/></svg>;
  if (key === 'instagram') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="3.6"/><circle className="platform-fill" cx="17.3" cy="6.9" r="1"/></svg>;
  if (key === 'x') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4l11.2 16H19L7.8 4H5zm12.6 0L5 20h1.8L19.4 4h-1.8z"/></svg>;
  if (key === 'youtube-shorts' || key === 'youtube') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 7.1a2.8 2.8 0 0 0-2-2C16.7 4.6 12 4.6 12 4.6s-4.7 0-6.4.5a2.8 2.8 0 0 0-2 2A29 29 0 0 0 3.1 12c0 1.6.1 3.3.5 4.9a2.8 2.8 0 0 0 2 2c1.7.5 6.4.5 6.4.5s4.7 0 6.4-.5a2.8 2.8 0 0 0 2-2c.4-1.6.5-3.3.5-4.9s-.1-3.3-.5-4.9z"/><path className="platform-cut" d="M10 8.8v6.4l5.5-3.2z"/></svg>;
  return <span aria-hidden="true">{channel.slice(0, 1)}</span>;
}

export function PlatformBadge({ channel }: { channel: string }) {
  return <span className={`platform-badge platform-${keyOf(channel)}`}><Mark channel={channel}/><span>{channel}</span></span>;
}
