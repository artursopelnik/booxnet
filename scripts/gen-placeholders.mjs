import sharp from 'sharp';
import { mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'images');
await mkdir(OUT, { recursive: true });

const W = 1200, H = 800;

const images = [
  {
    file: 'boox-palma-2.jpg',
    title: 'BOOX Palma 2',
    label: 'NEWS',
    bg1: '#0f172a', bg2: '#1e3a5f', accent: '#38bdf8',
    shapes: 'phone',
  },
  {
    file: 'boox-tab-ultra-c-pro.jpg',
    title: 'Tab Ultra C Pro',
    label: 'REVIEW',
    bg1: '#022c22', bg2: '#064e3b', accent: '#34d399',
    shapes: 'tablet',
  },
  {
    file: 'boox-note-air3-c.jpg',
    title: 'Note Air3 C',
    label: 'VERGLEICH',
    bg1: '#1e1b4b', bg2: '#2e1065', accent: '#a78bfa',
    shapes: 'split',
  },
  {
    file: 'getting-started.jpg',
    title: 'Getting Started',
    label: 'GUIDE',
    bg1: '#431407', bg2: '#78350f', accent: '#fbbf24',
    shapes: 'book',
  },
];

function makeSvg({ title, label, bg1, bg2, accent, shapes }) {
  const phoneDevice = `
    <!-- phone device -->
    <rect x="490" y="100" width="220" height="420" rx="24" fill="#111" stroke="#444" stroke-width="2"/>
    <rect x="498" y="130" width="204" height="330" rx="4" fill="#1a1a1a"/>
    <rect x="515" y="145" width="170" height="300" rx="2" fill="${bg2}" opacity="0.6"/>
    <circle cx="600" cy="510" r="12" fill="#333"/>
    <line x1="560" y1="118" x2="640" y2="118" stroke="#444" stroke-width="3" stroke-linecap="round"/>
  `;

  const tabletDevice = `
    <!-- tablet device -->
    <rect x="340" y="80" width="520" height="380" rx="18" fill="#111" stroke="#444" stroke-width="2"/>
    <rect x="352" y="95" width="496" height="350" rx="6" fill="#1a1a1a"/>
    <rect x="360" y="103" width="480" height="334" rx="3" fill="${bg2}" opacity="0.5"/>
    <circle cx="600" cy="488" r="8" fill="#333"/>
    <!-- e-ink screen lines -->
    <line x1="380" y1="140" x2="820" y2="140" stroke="${accent}" stroke-width="1" opacity="0.3"/>
    <line x1="380" y1="165" x2="720" y2="165" stroke="${accent}" stroke-width="1" opacity="0.2"/>
    <line x1="380" y1="190" x2="760" y2="190" stroke="${accent}" stroke-width="1" opacity="0.2"/>
    <line x1="380" y1="215" x2="680" y2="215" stroke="${accent}" stroke-width="1" opacity="0.2"/>
  `;

  const splitDevices = `
    <!-- two devices side by side -->
    <rect x="160" y="120" width="340" height="440" rx="16" fill="#111" stroke="#444" stroke-width="2"/>
    <rect x="172" y="140" width="316" height="400" rx="4" fill="${bg2}" opacity="0.5"/>
    <rect x="700" y="120" width="340" height="440" rx="16" fill="#0a0a0a" stroke="#555" stroke-width="2"/>
    <rect x="712" y="140" width="316" height="400" rx="4" fill="${bg1}" opacity="0.8"/>
    <line x1="590" y1="100" x2="610" y2="700" stroke="${accent}" stroke-width="1" opacity="0.4" stroke-dasharray="8,4"/>
    <text x="600" y="360" text-anchor="middle" fill="${accent}" font-size="28" font-family="serif" opacity="0.5">VS</text>
  `;

  const bookDevice = `
    <!-- open book -->
    <rect x="250" y="140" width="240" height="340" rx="4" fill="#f5f0e8" transform="rotate(-3,370,310)"/>
    <rect x="510" y="140" width="240" height="340" rx="4" fill="#faf7f2" transform="rotate(3,630,310)"/>
    <line x1="500" y1="140" x2="500" y2="480" stroke="#d4c5a9" stroke-width="2"/>
    <!-- text lines on pages -->
    <line x1="265" y1="175" x2="475" y2="170" stroke="#bbb" stroke-width="1.5" opacity="0.6" transform="rotate(-3,370,310)"/>
    <line x1="265" y1="195" x2="455" y2="190" stroke="#bbb" stroke-width="1.5" opacity="0.5" transform="rotate(-3,370,310)"/>
    <line x1="265" y1="215" x2="470" y2="210" stroke="#bbb" stroke-width="1.5" opacity="0.5" transform="rotate(-3,370,310)"/>
    <line x1="265" y1="235" x2="440" y2="230" stroke="#bbb" stroke-width="1.5" opacity="0.5" transform="rotate(-3,370,310)"/>
    <line x1="265" y1="255" x2="465" y2="250" stroke="#bbb" stroke-width="1.5" opacity="0.5" transform="rotate(-3,370,310)"/>
    <line x1="530" y1="175" x2="735" y2="178" stroke="#bbb" stroke-width="1.5" opacity="0.6" transform="rotate(3,630,310)"/>
    <line x1="530" y1="195" x2="720" y2="198" stroke="#bbb" stroke-width="1.5" opacity="0.5" transform="rotate(3,630,310)"/>
    <line x1="530" y1="215" x2="730" y2="218" stroke="#bbb" stroke-width="1.5" opacity="0.5" transform="rotate(3,630,310)"/>
    <line x1="530" y1="235" x2="710" y2="238" stroke="#bbb" stroke-width="1.5" opacity="0.5" transform="rotate(3,630,310)"/>
    <!-- book spine shadow -->
    <ellipse cx="500" cy="310" rx="6" ry="170" fill="#8a7a60" opacity="0.3"/>
  `;

  const shapeMap = {
    phone: phoneDevice,
    tablet: tabletDevice,
    split: splitDevices,
    book: bookDevice,
  };

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bg1}"/>
      <stop offset="100%" stop-color="${bg2}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <!-- noise-like pattern for texture -->
    <filter id="noise">
      <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
      <feBlend in="SourceGraphic" mode="overlay" result="blend"/>
      <feComposite in="blend" in2="SourceGraphic" operator="in"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <!-- Texture overlay -->
  <rect width="${W}" height="${H}" fill="url(#bg)" filter="url(#noise)" opacity="0.04"/>

  <!-- Radial glow -->
  <ellipse cx="${W / 2}" cy="${H / 2}" rx="${W * 0.55}" ry="${H * 0.55}" fill="url(#glow)"/>

  <!-- Subtle grid lines -->
  ${Array.from({ length: 8 }, (_, i) => `<line x1="${(i + 1) * (W / 9)}" y1="0" x2="${(i + 1) * (W / 9)}" y2="${H}" stroke="white" stroke-width="0.5" opacity="0.04"/>`).join('')}
  ${Array.from({ length: 5 }, (_, i) => `<line x1="0" y1="${(i + 1) * (H / 6)}" x2="${W}" y2="${(i + 1) * (H / 6)}" stroke="white" stroke-width="0.5" opacity="0.04"/>`).join('')}

  <!-- Decorative circles -->
  <circle cx="80" cy="80" r="120" fill="${accent}" opacity="0.04"/>
  <circle cx="${W - 80}" cy="${H - 80}" r="160" fill="${accent}" opacity="0.05"/>
  <circle cx="${W - 120}" cy="60" r="60" fill="${accent}" opacity="0.04"/>

  <!-- Main illustration -->
  ${shapeMap[shapes]}

  <!-- Bottom bar -->
  <rect x="0" y="${H - 80}" width="${W}" height="80" fill="black" opacity="0.35"/>

  <!-- Label chip -->
  <rect x="50" y="${H - 60}" width="80" height="22" rx="3" fill="${accent}" opacity="0.9"/>
  <text x="90" y="${H - 44}" text-anchor="middle" fill="${bg1}" font-size="10" font-family="Arial, sans-serif" font-weight="700" letter-spacing="1">${label}</text>

  <!-- Title text -->
  <text x="150" y="${H - 44}" fill="white" font-size="20" font-family="Georgia, serif" font-weight="700" opacity="0.95">${title}</text>

  <!-- Accent line top -->
  <rect x="0" y="0" width="${W}" height="3" fill="${accent}" opacity="0.8"/>
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
