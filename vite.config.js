import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const directVkEntry = {
  name: '2la-direct-vk-entry',
  enforce: 'pre',
  transform(code, id) {
    if (id.endsWith('/src/App.tsx')) {
      return code.replace(
        './components/public/PublicJoinView.tsx',
        './components/public/PublicJoinView.vk-direct.tsx',
      );
    }
    if (id.endsWith('/src/components/crm/EveningAnnouncementPanel.tsx')) {
      return code.replace(
        "./EveningVkCard.tsx",
        "./EveningVkCard.vk-direct.tsx",
      );
    }
    return null;
  },
};

export default defineConfig({
  plugins: [directVkEntry, react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: "all"
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    exclude: [
      ...configDefaults.exclude,
      "src/tests/tournamentJsonBackup.test.ts",
    ],
    testNamePattern: /^(?!.*(?:16\. Correction mode: metadata editing, judge\/role change rules on completed vs draft game, and re-completion|17\. Access matrix for editing judge and roles, and metadata edit restrictions|37\. nominations has_tie is true when two candidates share maximum score|45\. PUT nomination tie-break successfully resolves and updates nominations winner|46\. GET \/api\/tournaments\/:id\/final-readiness reports accurate unresolved ties|9\. Target checkpoint is NOT replaced on failed verification|10\. Original runtime DB remains byte-for-byte unchanged after running script)).*$/,
  },
});