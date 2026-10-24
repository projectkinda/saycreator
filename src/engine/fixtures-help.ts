// Help content fixtures. Only src/engine/index.ts may import this file.
import type { Guide, SupportInfo } from './types';

export const guideTopics = ['Videos', 'Images and assets', 'Calendar', 'Branding', 'Analytics', 'Credits and billing'];

export const guides: Guide[] = [
  {
    id: 'g-upload',
    title: 'Upload your first video',
    summary: 'Any length, from a phone or laptop. We listen to it first.',
    topic: 'Videos',
    steps: [
      'Choose New project, then Upload a video, and pick your file.',
      'Wait while we listen. You can leave the page; it keeps going.',
      'If the video is low resolution we tell you now, so zooms stay small.',
      'When it says "Done listening", choose a style.',
    ],
    link: { label: 'Start a project', to: '/videos/new' },
  },
  {
    id: 'g-edit',
    title: 'Pick a style and change the edit',
    summary: 'Start from a suggested style, then ask for changes in your own words.',
    topic: 'Videos',
    steps: [
      'Choose one of the suggested styles. We make the first edit for you.',
      'Under Change the edit, tap a suggestion or describe what to change.',
      'Choose Preview change. We tell you how we read it before anything is applied.',
      'Not happy? Use Undo in History. Every change is saved as a version.',
    ],
    link: { label: 'Open your videos', to: '/videos' },
  },
  {
    id: 'g-more',
    title: 'Make posts from one video',
    summary: 'Clips, a LinkedIn post, an X thread, a carousel, captions and an article.',
    topic: 'Videos',
    steps: [
      'Open a finished video and choose the tab Make more from this video.',
      'Tap Make it on what you want. The cost is on the button.',
      'Open the result to read it, copy it, or confirm anything we flagged.',
      'Choose Add to calendar when it is ready.',
    ],
    link: { label: 'Open your videos', to: '/videos' },
  },
  {
    id: 'g-images',
    title: 'Create a thumbnail, carousel or quote card',
    summary: 'Start from a template, a video frame, your own image, or AI.',
    topic: 'Images and assets',
    steps: [
      'Open Images and choose Create image.',
      'Pick a starting point and follow the short form.',
      'Your new image appears first, marked Draft.',
    ],
    link: { label: 'Open Images', to: '/images' },
  },
  {
    id: 'g-assets',
    title: 'Add logos, product shots and music',
    summary: 'We label them, cut out backgrounds, and warn you about problems.',
    topic: 'Images and assets',
    steps: [
      'Open Assets and drop your files, or choose Upload assets.',
      'Images can be PNG, JPG or WebP. Logos can be SVG. Music can be MP3 or WAV.',
      'Wait for "Labelling…" to finish. Look for warnings such as Low resolution.',
    ],
    link: { label: 'Open Assets', to: '/assets' },
  },
  {
    id: 'g-calendar',
    title: 'Plan your week',
    summary: 'Tell us your goal, then move things around and post each one yourself.',
    topic: 'Calendar',
    steps: [
      'Write your goal and choose Plan it for me. We add suggestions on empty days.',
      'Accept or remove each suggestion, or drag posts to another day.',
      'When it is time, choose Copy text, post it yourself, then Mark as posted.',
    ],
    link: { label: 'Open Calendar', to: '/calendar' },
  },
  {
    id: 'g-brand',
    title: 'Set up your brand kit and writing voice',
    summary: 'So everything we make looks and sounds like you.',
    topic: 'Branding',
    steps: [
      'Open Branding. Under Brand kit, edit your colours, fonts, logo and handle.',
      'Under Writing voice, paste two or three posts you have written.',
      'Check What we picked up and edit anything that is off.',
    ],
    link: { label: 'Open Branding', to: '/branding' },
  },
  {
    id: 'g-analytics',
    title: 'See how your posts are doing',
    summary: 'Connect an account to replace the example numbers with your own.',
    topic: 'Analytics',
    steps: [
      'Open Analytics. Until you connect an account you see example data.',
      'Choose Connect Instagram or Connect YouTube.',
      'Numbers refresh about once a day. Patterns are early signs, never proof.',
    ],
    link: { label: 'Open Analytics', to: '/analytics' },
  },
  {
    id: 'g-credits',
    title: 'What credits are and what things cost',
    summary: 'Credits pay for making things. The price is shown before it runs.',
    topic: 'Credits and billing',
    steps: [
      'Your plan includes credits each month. The meter in the menu shows what is left.',
      'Open Settings & billing to see what each action costs.',
      'Need more? Choose Add credits. You see the exact charge before you confirm.',
    ],
    link: { label: 'Open Settings & billing', to: '/settings' },
  },
];

export const supportInfo: SupportInfo = {
  replyTime: 'within 1 working day',
  topics: [
    { id: 'broken', label: 'Something is not working' },
    { id: 'billing', label: 'Billing or credits' },
    { id: 'question', label: 'A question about how to do something' },
    { id: 'idea', label: 'An idea or something missing' },
  ],
};

/** Offsets in days before today, so "New" always shows on the latest entry. */
export const releaseNotes = [
  {
    id: 'r3',
    daysAgo: 3,
    title: 'Plan your week with a goal',
    items: [
      'Calendar can now suggest posts for your empty days from a goal you write.',
      'Drag a post or an unscheduled item onto a day, or use Move.',
      'Home shows the same plan as the calendar.',
    ],
  },
  {
    id: 'r2',
    daysAgo: 20,
    title: 'Brand kit, writing voice and image library',
    items: [
      'Edit your colours, fonts, logo and handle and see a live preview.',
      'Teach us your voice with your own posts.',
      'A new Images page for thumbnails, carousels and quote cards.',
    ],
  },
  {
    id: 'r1',
    daysAgo: 45,
    title: 'Directed edits and Make more from this video',
    items: [
      'Pick Punchy, Calm or Cinematic and see why we cut it that way.',
      'Ask for changes in your own words and preview them first.',
      'Turn one video into clips, posts, a carousel and an article.',
    ],
  },
];
