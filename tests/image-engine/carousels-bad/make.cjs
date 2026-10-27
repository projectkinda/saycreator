// Not a test: how the two deliberately wordy decks were made (copies of myths-remote with one slide made far too long).
const fs = require('fs');
const base = JSON.parse(fs.readFileSync(__dirname + '/../carousels/myths-remote.json', 'utf8'));
const wordyBody = 'Most people think a short post is a lazy post, so they pack every idea they have into one slide: the background, the three reasons, the two exceptions, the story about a client, the caveat, the link to the long article and a reminder to follow. By the time the reader gets to the end of the second line they have already swiped away, and the one thing you wanted them to remember is buried under everything else.';
const a = structuredClone(base);
a.id = 'bad-wordy-content';
a.title = 'Deliberately bad: one content slide with far too many words';
a.note = 'Slide 4 has about 80 words. The words-per-slide check must fail it.';
a.slides[3] = { type: 'content', headline: 'Why short posts are not lazy posts', body: wordyBody, element_tags: ['write', 'time'] };
const b = structuredClone(base);
b.id = 'bad-wordy-beforeafter';
b.title = 'Deliberately bad: one before and after slide with far too many words';
b.note = 'Slide 2 has about 60 words. The words-per-slide check must fail it.';
b.slides[1] = {
  type: 'beforeafter',
  beforeLabel: 'What people assume',
  before: 'Working from home means you are always available, you answer messages at every hour, you never switch off, your manager cannot see what you do all day and so you feel you have to prove it.',
  afterLabel: 'What is actually true',
  after: 'Teams that agree on hours, write down what they decide and meet only when a meeting is needed get more done, feel less watched and can still switch off properly at the end of the day.',
  element_tags: ['warning', 'idea'],
};
fs.writeFileSync(__dirname + '/bad-wordy-content.json', JSON.stringify(a, null, 2));
fs.writeFileSync(__dirname + '/bad-wordy-beforeafter.json', JSON.stringify(b, null, 2));
