import { defineConfig } from "vite";
export default defineConfig({
  build: {
    outDir: "dist-dev",
    lib: {
      entry: "dev/ha-preview.ts",
      formats: ["es"],
      fileName: () => "proxmox-vm-test-card.js",
    },
    target: "es2022",
  },
});
