import { cp, mkdir, rm } from 'node:fs/promises';

const outputDirectory = new URL('../www/', import.meta.url);
const projectDirectory = new URL('../', import.meta.url);
const files = ['index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'sw.js'];
const directories = ['assets', 'src'];

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const file of files) {
  await cp(new URL(file, projectDirectory), new URL(file, outputDirectory));
}

for (const directory of directories) {
  await cp(new URL(directory, projectDirectory), new URL(directory, outputDirectory), { recursive: true });
}
