import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Static site: `npm run build` -> dist/ (deploy to Vercel/Netlify/GitHub Pages as-is, no server).
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: { port: 5173, host: "localhost" },
  build: { chunkSizeWarningLimit: 1500 },
});
