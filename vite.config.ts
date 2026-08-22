import { defineConfig } from "vite";

// base: "./" → relative asset URLs so the same build works both on the web and bundled OFFLINE
// inside the Capacitor shell (mobile-release.md). Content-hashed assets, SPA fallback.
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
