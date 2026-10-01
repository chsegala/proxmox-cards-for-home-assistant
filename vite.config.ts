import { defineConfig } from "vite";
export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: () => "proxmox-vm-card.js",
    },
    target: "es2022",
  },
});
