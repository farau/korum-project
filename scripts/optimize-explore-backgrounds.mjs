// Match the existing mobile CSS: center crop, 600px maximum width, 680px height.
// Keep the desktop originals and generate reproducible 1x/2x WebP derivatives.
import sharp from 'sharp';
for (const theme of ['dark', 'light']) {
  for (const scale of [1, 2]) {
    const input = new URL(`../public/design-vdef/home/${theme}.webp`, import.meta.url);
    const output = new URL(`../public/design-vdef/home/${theme}-mobile${scale === 2 ? '@2x' : ''}.webp`, import.meta.url);
    const result = await sharp(input.pathname)
      .resize(600 * scale, 680 * scale, { fit: 'cover', position: 'centre' })
      .webp({ quality: scale === 1 ? 90 : 85, effort: 6 }).toFile(output.pathname);
    console.log(`${output.pathname}: ${result.size} bytes`);
  }
}
