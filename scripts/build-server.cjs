const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Build the server TypeScript into a single CJS file for Electron
const distDir = path.join(__dirname, "..", "dist");
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Use esbuild to bundle server.ts into a single CJS file
// The banner injects __dirname for the bundled file since esbuild strips import.meta.url
execSync(
  'npx esbuild src/server.ts --bundle --platform=node --format=cjs --outfile=dist/server.cjs --external:electron --banner:js="const __bundled_dirname = __dirname;"',
  { cwd: path.join(__dirname, ".."), stdio: "inherit" }
);

// Copy public folder next to the bundled server (dist/public)
const publicSrc = path.join(__dirname, "..", "public");
const publicDest = path.join(distDir, "public");
if (fs.existsSync(publicDest)) {
  fs.rmSync(publicDest, { recursive: true });
}
fs.cpSync(publicSrc, publicDest, { recursive: true });

console.log("Build complete! dist/server.cjs + dist/public/");
