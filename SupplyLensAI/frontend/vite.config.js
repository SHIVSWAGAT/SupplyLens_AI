import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const isEmbeddedBuild = mode === "embedded";
  const isStaticSiteBuild = !isEmbeddedBuild;

  return {
    plugins: [react()],
    base: isEmbeddedBuild ? "/static/app/" : "/",
    build: {
      outDir: isStaticSiteBuild ? "dist" : "../static/app",
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom"],
            charts: ["recharts"],
            maps: ["leaflet", "react-leaflet"],
          },
        },
      },
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
    },
  };
});
