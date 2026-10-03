import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  // Open sessions may still need their earlier content-addressed lazy chunks.
  // Release packaging starts fresh; local in-place builds retain existing assets.
  build: { emptyOutDir: false },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/store-api": "http://127.0.0.1:8787",
      "/health": "http://127.0.0.1:8787",
    },
  },
});
