/* ============================================================================
   wrappedShare.js — esporta il Wrapped mensile come immagine in formato
   storia (1080×1920, 9:16 — Instagram/TikTok/WhatsApp Stories) e la
   condivide con lo share sheet nativo del telefono.
   ----------------------------------------------------------------------------
   Disegnato a mano su <canvas>, non con una libreria di screenshot DOM
   (es. html2canvas): stessa filosofia già in uso nel resto dell'app — zero
   dipendenze nuove per una singola immagine, e i font di sistema (mai un
   font esterno caricato, vedi GlobalStyle in AnamnesisShared.jsx) bastano
   per disegnare testo ed emoji su canvas esattamente come nel resto della UI.
   ========================================================================== */

const WIDTH = 1080;
const HEIGHT = 1920;
const PAD_X = 84;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Ritorna le righe in cui `text` va spezzato per stare entro maxWidth,
// senza disegnare nulla — serve per calcolare l'altezza del blocco PRIMA
// di decidere dove inizia il resto del layout (nessun testo sovrapposto).
function wrapLines(ctx, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  });
  if (current) lines.push(current);
  return lines;
}

function drawTileGrid(ctx, tiles, top, colWidth, gap) {
  const tileH = 236;
  let y = top;
  for (let i = 0; i < tiles.length; i += 2) {
    const rowTiles = tiles.slice(i, i + 2);
    rowTiles.forEach((tile, col) => {
      const x = PAD_X + col * (colWidth + gap);
      ctx.fillStyle = "rgba(255,255,255,0.13)";
      roundRect(ctx, x, y, colWidth, tileH, 28);
      ctx.fill();

      ctx.textAlign = "left";
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "64px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
      ctx.fillText(tile.emoji, x + 32, y + 92);

      ctx.font = "800 52px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
      ctx.fillText(String(tile.value), x + 32, y + 160);

      ctx.font = "400 26px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
      ctx.globalAlpha = 0.85;
      const labelLines = wrapLines(ctx, tile.label, colWidth - 64).slice(0, 2);
      labelLines.forEach((line, li) => ctx.fillText(line, x + 32, y + 196 + li * 32));
      ctx.globalAlpha = 1;
    });
    y += tileH + gap;
  }
  return y - gap; // fine effettiva del blocco (senza il gap finale)
}

// Costruisce l'immagine PNG del Wrapped come Blob. `stats`/`profile`/`accent`
// hanno la STESSA forma già usata da WrappedModal (08_ClientProfileView.jsx)
// — nessun ricalcolo, solo un altro modo di mostrare gli stessi dati reali.
export function renderWrappedStoryImage(stats, profile, accent) {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, WIDTH * 0.3, HEIGHT);
  gradient.addColorStop(0, accent || "#C5A059");
  gradient.addColorStop(0.65, "#111111");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const tiles = [
    { emoji: "🏋️", value: stats.workoutDays, label: stats.workoutDays === 1 ? "giorno di allenamento" : "giorni di allenamento" },
    { emoji: "🔢", value: Number(stats.totalSets).toLocaleString("it-IT"), label: "serie totali svolte" },
    { emoji: "🏔️", value: `${Number(stats.totalVolumeKg).toLocaleString("it-IT")} kg`, label: "volume totale sollevato" },
    { emoji: "🍽️", value: stats.nutritionDays, label: "giorni con diario alimentare compilato" },
  ];
  const wellnessTiles = [
    stats.avgSleep != null && { emoji: "😴", value: `${stats.avgSleep}h`, label: "sonno medio" },
    stats.avgMotivation != null && { emoji: "🔥", value: `${stats.avgMotivation}/10`, label: "motivazione media" },
    stats.avgDigestion != null && { emoji: "🌿", value: `${stats.avgDigestion}/10`, label: "digestione media" },
    stats.avgFatigue != null && { emoji: "🔋", value: `${stats.avgFatigue}/10`, label: "fatica percepita media" },
  ].filter(Boolean);

  const colWidth = (WIDTH - PAD_X * 2 - 28) / 2;

  // Eyebrow "PERFORM · IL TUO WRAPPED"
  ctx.textAlign = "left";
  ctx.fillStyle = "#FFFFFF";
  ctx.globalAlpha = 0.85;
  ctx.font = "700 30px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("PERFORM · IL TUO WRAPPED", PAD_X, 150);
  ctx.globalAlpha = 1;

  // Titolo
  const greeting = profile?.nickname ? `${profile.nickname}, ecco il tuo mese 🎉` : "Ecco il tuo mese 🎉";
  ctx.font = "800 68px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  const titleLines = wrapLines(ctx, greeting, WIDTH - PAD_X * 2);
  let cursorY = 240;
  titleLines.forEach((line) => { ctx.fillText(line, PAD_X, cursorY); cursorY += 78; });

  cursorY += 40;
  cursorY = drawTileGrid(ctx, tiles, cursorY, colWidth, 28) + 28;

  if (wellnessTiles.length > 0) {
    cursorY += 56;
    ctx.font = "700 28px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
    ctx.globalAlpha = 0.75;
    ctx.fillText("COME TI SEI SENTITO", PAD_X, cursorY);
    ctx.globalAlpha = 1;
    cursorY += 40;
    cursorY = drawTileGrid(ctx, wellnessTiles, cursorY, colWidth, 28);
  }

  // Firma in fondo, sempre alla stessa altezza da terra (non segue
  // cursorY): questa immagine viaggia fuori dall'app (storie IG/TikTok/
  // WhatsApp) — la firma è quello che la rende marketing gratuito per chi
  // la condivide, non solo un promemoria personale.
  ctx.textAlign = "center";
  ctx.globalAlpha = 0.8;
  ctx.font = "700 30px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("PERFORM", WIDTH / 2, HEIGHT - 100);
  ctx.font = "400 24px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  ctx.globalAlpha = 0.65;
  ctx.fillText("il tuo coach, sempre con te", WIDTH / 2, HEIGHT - 64);
  ctx.globalAlpha = 1;

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Impossibile generare l'immagine"))), "image/png");
  });
}

// Punto d'ingresso unico usato dalla UI: genera l'immagine e la condivide
// con lo share sheet nativo (Instagram/TikTok/WhatsApp compaiono lì se
// installate, esattamente come per una foto qualunque). Se il browser non
// supporta la condivisione di file (desktop, Safari datato) ripiega su un
// download diretto — mai un errore silenzioso, l'utente ottiene comunque
// l'immagine in entrambi i casi.
export async function shareWrappedStory(stats, profile, accent) {
  const blob = await renderWrappedStoryImage(stats, profile, accent);
  const file = new File([blob], "perform-wrapped.png", { type: "image/png" });

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: "Il mio Wrapped PERFORM" });
    return "shared";
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "perform-wrapped.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}
