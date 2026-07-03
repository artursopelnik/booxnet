import sharp from 'sharp';
import { mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'images');
await mkdir(OUT, { recursive: true });

const W = 1200, H = 800;

/* Clean-tech product renders: dark device on light neutral surface (boox.com style) */
const images = [
  { file: 'boox-palma-2.jpg',          shapes: 'phone'  },
  { file: 'boox-tab-ultra-c-pro.jpg',  shapes: 'tablet' },
  { file: 'boox-note-air3-c.jpg',      shapes: 'split'  },
  { file: 'getting-started.jpg',       shapes: 'book'   },
];

const DEVICE = '#1D1D1F';
const SCREEN = '#F0EFEA';   /* e-ink paper tone */
const LINE   = '#B9B9BE';

function makeSvg({ shapes }) {
  const phone = `
    <rect x="490" y="130" width="220" height="440" rx="28" fill="${DEVICE}"/>
    <rect x="504" y="158" width="192" height="360" rx="6" fill="${SCREEN}"/>
    <line x1="522" y1="190" x2="678" y2="190" stroke="${LINE}" stroke-width="3" stroke-linecap="round"/>
    <line x1="522" y1="215" x2="650" y2="215" stroke="${LINE}" stroke-width="3" stroke-linecap="round" opacity="0.7"/>
    <line x1="522" y1="240" x2="666" y2="240" stroke="${LINE}" stroke-width="3" stroke-linecap="round" opacity="0.7"/>
    <line x1="522" y1="265" x2="630" y2="265" stroke="${LINE}" stroke-width="3" stroke-linecap="round" opacity="0.7"/>
    <circle cx="600" cy="545" r="10" fill="#3A3A3C"/>
  `;

  const tablet = `
    <rect x="320" y="110" width="560" height="420" rx="22" fill="${DEVICE}"/>
    <rect x="338" y="128" width="524" height="384" rx="8" fill="${SCREEN}"/>
    <line x1="368" y1="170" x2="820" y2="170" stroke="${LINE}" stroke-width="4" stroke-linecap="round"/>
    <line x1="368" y1="200" x2="760" y2="200" stroke="${LINE}" stroke-width="4" stroke-linecap="round" opacity="0.7"/>
    <line x1="368" y1="230" x2="790" y2="230" stroke="${LINE}" stroke-width="4" stroke-linecap="round" opacity="0.7"/>
    <line x1="368" y1="260" x2="720" y2="260" stroke="${LINE}" stroke-width="4" stroke-linecap="round" opacity="0.7"/>
    <line x1="368" y1="290" x2="800" y2="290" stroke="${LINE}" stroke-width="4" stroke-linecap="round" opacity="0.7"/>
    <!-- stylus -->
    <rect x="900" y="180" width="14" height="300" rx="7" fill="${DEVICE}" transform="rotate(14 907 330)"/>
  `;

  const split = `
    <rect x="180" y="150" width="380" height="480" rx="20" fill="${DEVICE}" transform="rotate(-2 370 390)"/>
    <rect x="196" y="168" width="348" height="444" rx="8" fill="${SCREEN}" transform="rotate(-2 370 390)"/>
    <rect x="640" y="150" width="380" height="480" rx="20" fill="#3A3A3C" transform="rotate(2 830 390)"/>
    <rect x="656" y="168" width="348" height="444" rx="8" fill="${SCREEN}" transform="rotate(2 830 390)"/>
    <line x1="230" y1="230" x2="500" y2="222" stroke="${LINE}" stroke-width="4" stroke-linecap="round"/>
    <line x1="232" y1="260" x2="470" y2="253" stroke="${LINE}" stroke-width="4" stroke-linecap="round" opacity="0.7"/>
    <line x1="700" y1="222" x2="960" y2="230" stroke="${LINE}" stroke-width="4" stroke-linecap="round"/>
    <line x1="702" y1="253" x2="930" y2="260" stroke="${LINE}" stroke-width="4" stroke-linecap="round" opacity="0.7"/>
  `;

  const book = `
    <rect x="300" y="160" width="290" height="420" rx="10" fill="${DEVICE}" transform="rotate(-3 445 370)"/>
    <rect x="314" y="176" width="262" height="388" rx="6" fill="${SCREEN}" transform="rotate(-3 445 370)"/>
    <line x1="345" y1="230" x2="545" y2="220" stroke="${LINE}" stroke-width="4" stroke-linecap="round"/>
    <line x1="347" y1="258" x2="520" y2="249" stroke="${LINE}" stroke-width="4" stroke-linecap="round" opacity="0.7"/>
    <line x1="349" y1="286" x2="535" y2="277" stroke="${LINE}" stroke-width="4" stroke-linecap="round" opacity="0.7"/>
    <!-- floating checkmark card -->
    <rect x="640" y="260" width="260" height="180" rx="16" fill="white"/>
    <circle cx="700" cy="330" r="26" fill="none" stroke="${DEVICE}" stroke-width="5"/>
    <path d="M688 330 l9 9 16 -18" fill="none" stroke="${DEVICE}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="748" y1="318" x2="860" y2="318" stroke="${LINE}" stroke-width="5" stroke-linecap="round"/>
    <line x1="748" y1="344" x2="830" y2="344" stroke="${LINE}" stroke-width="5" stroke-linecap="round" opacity="0.7"/>
  `;

  const shapeMap = { phone, tablet, split, book };

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#F4F5F7"/>
      <stop offset="100%" stop-color="#DFE1E4"/>
    </linearGradient>
    <radialGradient id="floor" cx="50%" cy="88%" r="45%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <!-- soft floor shadow under device -->
  <ellipse cx="${W / 2}" cy="${H * 0.82}" rx="${W * 0.33}" ry="${H * 0.09}" fill="url(#floor)"/>

  ${shapeMap[shapes]}
</svg>`;
}

for (const img of images) {
  const svg = Buffer.from(makeSvg(img));
  const outPath = join(OUT, img.file);
  await sharp(svg)
    .resize(W, H)
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(outPath);
  console.log(`✓ ${outPath}`);
}

console.log('\nDone.');
