import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <rect width="512" height="512" rx="96" fill="#fdf6ec" />
  <text x="256" y="330" font-size="300" text-anchor="middle">✏️</text>
</svg>
`;

await mkdir('public', { recursive: true });

for (const size of [192, 512]) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(`public/icon-${size}.png`);
}

console.log('Íconos generados en public/icon-192.png y public/icon-512.png');
