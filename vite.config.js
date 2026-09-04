import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        // Splitta le librerie di terze parti (che cambiano di rado) dal
        // codice dell'app (che cambia a ogni deploy — in questo progetto
        // anche più volte al giorno). Senza questo, OGNI push invalidava
        // l'intero bundle principale: un cliente che riapre l'app dopo un
        // aggiornamento riscaricava anche React/framer-motion/Supabase da
        // zero, anche se non erano cambiati. Con chunk separati, il
        // browser tiene questi in cache tra un deploy e l'altro — scarica
        // solo il codice dell'app che è davvero cambiato. Non riduce i
        // byte del primo caricamento in assoluto, ma velocizza molto ogni
        // ricarica successiva a un aggiornamento (il caso più comune per
        // un'app aperta ogni giorno).
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          // BUG PRESO: un catch-all "return 'vendor'" per qualunque altra
          // dipendenza inglobava anche leaflet/@zxing in quel chunk — prima
          // di questo file erano già correttamente isolati da Rollup in
          // chunk separati, scaricati SOLO quando la mappa GPS o lo
          // scanner barcode si aprono davvero (import() dinamico). Un
          // catch-all li avrebbe uniti al bundle sempre-caricato, il
          // contrario di quello che serve. Meglio nominare solo le librerie
          // che VOGLIAMO isolare e lasciare `undefined` per tutto il resto:
          // Rollup applica il suo chunking automatico, che già rispetta
          // import statici vs dinamici.
          if (id.includes("framer-motion")) return "vendor-framer-motion";
          if (id.includes("lucide-react")) return "vendor-lucide";
          if (id.includes("@supabase")) return "vendor-supabase";
          if (id.includes("/react-dom/") || id.includes("/react/") || id.includes("/scheduler/")) return "vendor-react";
          return undefined;
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.js"],
  },
});
