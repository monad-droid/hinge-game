import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2022",
    outDir: "dist",
  },
  server: {
    // Optional hot-reload workflow: `wrangler dev` on :8787 for the API,
    // `vite dev` on :5173 for the frontend.
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
