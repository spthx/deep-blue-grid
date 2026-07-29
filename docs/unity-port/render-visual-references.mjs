import { access } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const defaults = [
  "docs/unity-port/images/cic-surface-damage-reference.svg",
  "docs/unity-port/images/ui-surfaces/cic-scanline-noise-tile.svg",
  "docs/unity-port/images/ui-surfaces/radar-board-surface-sample.svg",
  "docs/unity-port/images/ui-surfaces/command-button-state-strip.svg",
];

const sources = process.argv.slice(2);
const selected = sources.length > 0 ? sources : defaults;

for (const source of selected) {
  const absoluteSource = path.resolve(source);
  await access(absoluteSource);
  const destination = absoluteSource.replace(/\.svg$/i, ".png");
  if (destination === absoluteSource) {
    throw new Error(`Expected an SVG input: ${source}`);
  }

  await sharp(absoluteSource, { density: 144 })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(destination);

  const metadata = await sharp(destination).metadata();
  console.log(`${path.relative(process.cwd(), destination)} ${metadata.width}x${metadata.height}`);
}
