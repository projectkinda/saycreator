// Which of the user's test photos (test-assets/) each Step 11 deck uses. These are TEST ASSETS: private, not shippable.
// File names live only here, in tests: nothing under src/ may mention them (npm run check:test-assets).
export const GALLERY_PHOTO = 'maria-ivanova-K4VF01kj3AM-unsplash.jpg';

/** URL the dev server gives a test photo. */
export const photoUrl = (name: string) => '/test-assets/' + encodeURIComponent(name);

export interface PhotoPick {
  id: string;
  file: string;
  label: string;
  /** Where the subject is, 0 to 1 (so the crop keeps it). */
  focal?: { x: number; y: number };
}

const P = (id: string, file: string, label: string, x = 0.5, y = 0.5): PhotoPick => ({ id, file, label, focal: { x, y } });
const HOTEL = P('hotel', 'fabio-sasso-Gi-HkcQRyfE-unsplash.jpg', 'hotel at dusk', 0.5, 0.4);
const ALLEY = P('alley', 'julien-pWGIzA__WQ4-unsplash.jpg', 'night alley');
const PARIS = P('paris', 'maria-ivanova-K4VF01kj3AM-unsplash.jpg', 'Paris street', 0.5, 0.45);
const NEON = P('neon', 'wenhao-ruan-mpTzbHETUz8-unsplash.jpg', 'neon crossing');
const PORTO = P('porto', 'vincent-yap-dTnD8utJT04-unsplash.jpg', 'old town');
const BEETLE = P('beetle', 'maximilian-bungart-4xBJAKfE8R0-unsplash.jpg', 'white car');
const YELLOW = P('yellow-car', 'vaclav-pechar-dkk9fCXJGsk-unsplash.jpg', 'yellow car in a stream', 0.55, 0.55);
const SILHOUETTE = P('silhouette', 'tr-ng-tuy-t-ly-ePCinTh36Y4-unsplash.jpg', 'figure on wet sand', 0.5, 0.6);
const LEAF = P('leaf', 'emanuel-haas-aatG4lqAeGQ-unsplash.jpg', 'leaf on wood', 0.5, 0.6);
const DOG = P('dog', 'michal-petras-UpKEKb_58_Y-unsplash.jpg', 'dog with a stick', 0.5, 0.4);
const STUDIO = P('studio', 'baruk-granda-FKf0FU7OuPM-unsplash.jpg', 'band in a room', 0.5, 0.4);
const CROWD = P('street-crowd', 'bruno-bd-6sRXFQszA74-unsplash.jpg', 'crowd by a temple', 0.45, 0.5);
const SUNSET = P('sunset', 'rafael-garcin-nOage9h5O4c-unsplash.jpg', 'sunset sea', 0.5, 0.45);
const DUNE = P('dune', 'yasin-onus-eRrp5uh5otU-unsplash.jpg', 'dusk desert', 0.5, 0.4);
const LIGHTHOUSE = P('lighthouse', 'selina-farzaei-oSCu52hQUkg-unsplash.jpg', 'lighthouse path');
const CLIFFS = P('cliffs', 'vincent-yap-55o6N9bVen0-unsplash.jpg', 'cliffs and sea', 0.6, 0.4);
const CAVE = P('cave', 'vincent-yap-e0U1IaXiqUg-unsplash.jpg', 'cave and boats');
const FOREST = P('forest', 'filip-kvasnak-46gPlblkRSI-unsplash.jpg', 'forest path');

/**
 * Photos that suit each of the three styles: the first six are for single-photo slides (by slide position), the last three are kept
 * for photo strips.
 */
export const PHOTO_SETS: Record<string, PhotoPick[]> = {
  'mono-poster': [HOTEL, PARIS, DOG, BEETLE, NEON, ALLEY, PORTO, STUDIO, CROWD],
  'film-paper': [YELLOW, SILHOUETTE, CLIFFS, LEAF, STUDIO, CROWD, DOG, PORTO, PARIS],
  'glass-gradient': [SUNSET, DUNE, LIGHTHOUSE, CLIFFS, CAVE, FOREST, LEAF, PORTO, YELLOW],
};
