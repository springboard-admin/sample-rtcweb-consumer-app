import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // webrtc-core is a local file: dep; let Vite prebundle it + its deps.
    include: ["webrtc-core"],
  },
  server: { port: 5180 },
});
