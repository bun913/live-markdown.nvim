/**
 * Download vendored assets (mermaid.min.js) for development and build.
 * Skips download if the file already exists (use --force to re-download).
 *
 * Usage:
 *   deno task setup          # download if missing
 *   deno task setup --force  # always re-download
 */

import { join, dirname, fromFileUrl } from "https://deno.land/std@0.224.0/path/mod.ts";

const MERMAID_VERSION = "11.13.0";
const MERMAID_CDN_URL = `https://cdn.jsdelivr.net/npm/mermaid@${MERMAID_VERSION}/dist/mermaid.min.js`;

const scriptDir = dirname(fromFileUrl(import.meta.url));
const vendorDir = join(scriptDir, "..", "..", "client", "vendor");
const outputPath = join(vendorDir, "mermaid.min.js");

const force = Deno.args.includes("--force");

async function download(url: string, dest: string): Promise<void> {
  console.log(`Downloading ${url} ...`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  }
  const content = new Uint8Array(await res.arrayBuffer());
  await Deno.mkdir(dirname(dest), { recursive: true });
  await Deno.writeFile(dest, content);
  const sizeMB = (content.length / 1024 / 1024).toFixed(1);
  console.log(`  -> ${dest} (${sizeMB} MB)`);
}

// Check if already exists
if (!force) {
  try {
    await Deno.stat(outputPath);
    console.log(`mermaid.min.js already exists (use --force to re-download)`);
    Deno.exit(0);
  } catch {
    // File doesn't exist, proceed with download
  }
}

await download(MERMAID_CDN_URL, outputPath);
console.log("Setup complete.");
