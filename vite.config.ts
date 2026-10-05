import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const licenseNotices = ["LICENSE", "THIRD_PARTY_NOTICES.md"]
  .map((file) => readFileSync(new URL(file, import.meta.url), "utf8"))
  .join("\n\n");
export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: () => "proxmox-vm-card.js",
    },
    target: "es2022",
    rollupOptions: {
      output: { banner: `/*!\n${licenseNotices}\n*/` },
    },
  },
});
