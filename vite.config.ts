import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
   plugins: [react()],
   base: "./",
   server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      watch: {
         ignored: ["**/dist/**", "**/dist-electron/**", "**/release/**", "**/release-verify/**"],
      },
   },
   build: {
      outDir: "dist",
      emptyOutDir: true,
   },
});
