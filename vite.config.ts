import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  /**
   * Capacitor loads from the filesystem and needs a relative base, which is the
   * default here. GitHub Pages serves a project site from a subpath, and a
   * relative base there gives the service worker the wrong scope -- so the
   * deploy workflow sets VITE_BASE=/<repo-name>/ explicitly.
   */
  base: process.env.VITE_BASE ?? "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"],
      manifest: {
        name: "Barograph — atmospheric readout",
        short_name: "Barograph",
        description:
          "Reads a weather station and computes what it actually means: dew point, apparent temperature, climate anomaly and a plain-language advisory.",
        theme_color: "#14201d",
        background_color: "#dce3de",
        display: "standalone",
        orientation: "portrait",
        start_url: "./",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          // Separate file: maskable icons need padding inside the safe area,
          // otherwise Android crops the artwork on round/squircle masks.
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        runtimeCaching: [
          {
            // Live readings: prefer network, fall back to the last good response offline.
            urlPattern: /^https:\/\/(api|geocoding-api)\.open-meteo\.com\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "open-meteo-live",
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 3 }
            }
          },
          {
            // 1991-2020 normals never change. Cache them hard.
            urlPattern: /^https:\/\/archive-api\.open-meteo\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "open-meteo-normals",
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 90 }
            }
          }
        ]
      }
    })
  ],
  build: { outDir: "dist", sourcemap: true }
});
