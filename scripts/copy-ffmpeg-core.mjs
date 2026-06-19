import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceDir = join(rootDir, "node_modules", "@ffmpeg", "core", "dist", "esm");
const targetDir = join(rootDir, "public", "ffmpeg");

await mkdir(targetDir, { recursive: true });

for (const fileName of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) {
  await copyFile(join(sourceDir, fileName), join(targetDir, fileName));
}
