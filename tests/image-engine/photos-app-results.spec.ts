// Puts "Photos in the app" on the Results screen (Photo tools): the screenshots of the flow, the timings, and what is weak.
// Reads what photos-app-flow.spec.ts saved. The timings come from one run on this computer and are not a benchmark.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { outUrl, writeStepResults, type ResultsItem } from './results';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FLOW = path.join(ROOT, 'out/image-engine/photos-app-flow');

test('Photos in the app: Results item', async () => {
  test.skip(!fs.existsSync(path.join(FLOW, 'timings.json')), 'Run photos-app-flow.spec.ts first.');
  const t = JSON.parse(fs.readFileSync(path.join(FLOW, 'timings.json'), 'utf8')) as { times: Record<string, number>; photos: string[] };
  const x = t.times;
  const secs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);
  const shot = (file: string, id: string, title: string, caption: string): ResultsItem => ({ id, title, tag: 'Made with test pictures drawn in the page (not your photos)', images: [{ url: outUrl(path.join(FLOW, file)), label: title }], facts: [caption] });

  const flow: ResultsItem[] = [
    shot('01-photo-slots-empty.png', 'slots-empty', '1. Empty photo slots', 'A style with photo layouts and a script with photo hints: each slide that asks for a photo shows "Ideal photo: ..." and a drop area. A slide with no photo slot has no photo control.'),
    shot('02-photos-strip.png', 'strip', '2. The Photos strip', 'Ten photos of different sizes and orientations added in one go. Each shows its size, how big the file is and how many slides use it. Drag one onto a slide, or use "Use a photo…" on the slide.'),
    shot('03-slide-with-photo.png', 'slide', '3. A slide with a photo', 'The photo fills the slot. Under it: treatment, a crop point you can drag, and, on layouts that have them, a frame or a shape.'),
    shot('04-treatment.png', 'treatment', '4. Treatment and live preview', 'Style’s own look, none, black and white, duotone, halftone, grain, blur, tint. The small picture beside the choices is a live preview. Every change is one undo step.'),
    shot('05-crop-point.png', 'crop', '5. The crop point', 'Drag the dot so the crop keeps your subject (or use the arrow keys). The slide is drawn again with the new crop.'),
    shot('06-object.png', 'object', '6. An object', 'A transparent PNG with size, turn, position and an effect (soft shadow, drop shadow, glow). It sits on top of the slide’s other content, so move it where it does not cover words.'),
    shot('07-after-refresh.png', 'refresh', '7. After a refresh', 'The project comes back with its photos, treatments, crop points and objects, read out of this browser’s storage. The zip download is made from these slides.'),
  ];

  const notes: ResultsItem[] = [
    { id: 'timings', title: 'Timings on this computer', images: [], facts: [`Ten photos (${t.photos.join(', ')}; ${(x.bytesOfTenPhotos / 1048576).toFixed(1)} MB in all) added together: ${secs(x.addTenPhotosMs)}. One slide drawn again after a treatment change: ${secs(x.redrawAfterTreatmentChangeMs)}; after moving the crop point: ${secs(x.redrawAfterCropMoveMs)}. A refresh to all seven slides drawn again (photos read back from storage): ${secs(x.refreshToAllSlidesDrawnMs)}. The zip of seven slides: ${secs(x.exportZipMs)} (${(x.zipBytes / 1048576).toFixed(1)} MB). One run in Chrome on this computer, not a benchmark; the test photos are drawn shapes, so real photos may be slower to decode.`] },
    { id: 'where', title: 'Where the pictures are', images: [], facts: ['In this browser’s own storage (IndexedDB), and nowhere else. The page never asks the network for a picture (a test checks this). The original file is kept as it was added; a working copy, turned the right way up and at most 3000 pixels on the long side, is what is drawn, so nothing is drawn below the 1080 by 1350 slide unless the original was smaller. If the browser would not store a picture, the person is told and the project keeps working until the refresh.'] },
    { id: 'weak-object', title: 'Weak: an object can cover the words', images: [], tag: 'WEAK', facts: ['An object starts in the lower middle of the slide and can sit on top of the headline (see screenshot 6). It is not placed in free space for you, and the checks do not look at it: move it yourself.'] },
    { id: 'weak-strips', title: 'Weak: the last three photos are kept for strips', images: [], tag: 'WEAK', facts: ['With five or more photos, single-photo slides take them in turn from the first ones and the last three are kept for the 3-up strip layout. A photo in that group is not put on a slide by itself; you can still put it on any slide by hand. The strip says "on 0 slides" for it, which can look like a mistake.'] },
    { id: 'weak-text', title: 'Weak: words are placed for the photo’s first crop', images: [], tag: 'WEAK', facts: ['Where the words go on a photo is worked out from the photo with its crop centred. If you move the crop point a long way, the overlay may be too weak or too strong; the check after drawing adds a stronger overlay when contrast fails, but the first guess is for the centred crop.'] },
    { id: 'weak-formats', title: 'Weak: HEIC, and the browser can clear storage', images: [], tag: 'WEAK', facts: ['HEIC photos (iPhones) are read only by a browser that can decode them itself (Safari); in Chrome and others the card says "This is an HEIC photo. Convert it to JPG or PNG, then add it again." No permissively licensed reader exists (see LICENSES-ASSETS.md). A browser can clear a site’s storage; the project then shows "Not in storage" for those photos and asks to add them again.'] },
    { id: 'untested', title: 'Not tested', images: [], tag: 'NOT TESTED', facts: ['Only Chrome. Safari and Firefox (EXIF turning and drag and drop may differ), touch screens, a real full-storage browser (it was simulated by making the store fail), pictures over 100 million pixels (a 54 million pixel one was tried), and more than ten photos.'] },
  ];

  expect(flow.length).toBe(7);
  writeStepResults({
    id: 'photos-app',
    title: 'Photos in the app',
    order: 12,
    intro: 'Adding your own photos inside Images > Make a carousel. Everything here was made by a test that uses the app like a person: it adds ten pictures drawn in the page (no private photo is used).',
    groups: [
      { title: 'Photos in the app: the flow', items: flow },
      { title: 'Photos in the app: timings and findings', items: notes },
    ],
  });
});
