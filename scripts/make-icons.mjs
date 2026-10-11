// Renders the app icons from one SVG. Run `npm run icons` after changing it.
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';

/** @type {(fill: string, hole: string) => string} */
const tag = (fill, hole) => `
  <g transform="rotate(45 256 256)">
    <path d="M256 92 L372 196 V404 a24 24 0 0 1 -24 24 H164 a24 24 0 0 1 -24 -24 V196 Z" fill="${fill}" stroke="${fill}" stroke-width="28" stroke-linejoin="round"/>
    <circle cx="256" cy="190" r="26" fill="${hole}"/>
  </g>
  <text x="242" y="322" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="112" fill="${hole}" text-anchor="middle">%</text>`;

/** @param {boolean} pad */
const icon = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${pad ? 0 : 112}" fill="#0E1012"/>
  <g transform="translate(256 256) scale(${pad ? 0.66 : 0.82}) translate(-256 -256)">${tag('#C6F432', '#0E1012')}</g>
</svg>`;

const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <g transform="translate(256 256) scale(0.95) translate(-256 -256)">${tag('#FFFFFF', 'rgba(0,0,0,0)')}</g>
</svg>`;

const out = 'public/icons';
await writeFile(`${out}/favicon.svg`, icon(false));
/** @type {[string, string, number][]} */
const jobs = [
  [icon(false), 'icon-192.png', 192],
  [icon(false), 'icon-512.png', 512],
  [icon(true), 'maskable-512.png', 512],
  [icon(true), 'apple-touch-icon.png', 180],
  [badge, 'badge-96.png', 96],
];
for (const [svg, name, size] of jobs) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(`${out}/${name}`);
  console.log('wrote', name);
}
