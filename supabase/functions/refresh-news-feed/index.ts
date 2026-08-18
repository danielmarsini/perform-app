// PERFORM — Edge Function: refresh-news-feed
// ============================================================================
// Chiamata dal cron ogni 2 ore (non più una volta al giorno alle 7, vedi
// istruzioni fornite a parte per il nuovo cron.schedule): niente client
// loggato dietro, stesso pattern x-cron-secret di streak-reminder/
// monthly-xp-snapshot. Ogni chiamata ha solo il 40% di probabilità di
// pubblicare davvero (POST_PROBABILITY sotto) — con 12 chiamate al giorno
// diventano in media 4-5 pubblicazioni, a orari che sembrano naturali/
// casuali invece di un post fisso alla stessa ora, più vicino a un feed
// social vero. Pesca studi REALI e recenti da PubMed (l'archivio pubblico
// di letteratura biomedica del NIH americano, gratuito, senza chiave API)
// su una rotazione di argomenti allenamento/alimentazione/integrazione/
// recupero/farmacologia sportiva, e pubblica due righe in coach_news_tips
// per ogni studio nuovo trovato:
//   - channel 'news'  → il titolo e l'abstract riassunti, come una notizia
//   - channel 'tips'  → lo stesso studio riformulato come applicazione pratica
// source_query resta il link "leggi lo studio originale" verso PubMed (vedi
// pubmedSearchUrl in 06_NewsTipsView.jsx, già esistente). Nessun contenuto
// scritto da zero o inventato: solo titolo + abstract reali, tradotti con
// un riassunto meccanico (prime frasi), mai riscritti o interpretati da
// un'IA — è la scelta fatta esplicitamente invece di usare una chiave API
// LLM a pagamento.

import { createClient } from "npm:@supabase/supabase-js@2";

const NCBI_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const POST_PROBABILITY = 0.4;

// Una rotazione di argomenti reali per i 5 temi richiesti: allenamento,
// alimentazione, integrazione, recupero atleti, farmacologia sportiva.
// L'argomento cambia ogni 2 ore (stessa cadenza del cron), non più una
// volta al giorno — con più chiamate al giorno serve più varietà.
const TOPICS = [
  { query: "resistance training hypertrophy randomized", eyebrow: "Allenamento" },
  { query: "resistance training program variables strength", eyebrow: "Allenamento" },
  { query: "high intensity interval training adaptations", eyebrow: "Allenamento" },
  { query: "protein intake muscle protein synthesis athletes", eyebrow: "Alimentazione" },
  { query: "carbohydrate periodization athletic performance", eyebrow: "Alimentazione" },
  { query: "caloric deficit body composition resistance training", eyebrow: "Alimentazione" },
  { query: "creatine supplementation strength performance", eyebrow: "Integrazione" },
  { query: "dietary supplement athletic performance randomized trial", eyebrow: "Integrazione" },
  { query: "caffeine supplementation exercise performance", eyebrow: "Integrazione" },
  { query: "sleep athletic recovery performance", eyebrow: "Recupero" },
  { query: "delayed onset muscle soreness recovery intervention", eyebrow: "Recupero" },
  { query: "overtraining syndrome athletes recovery", eyebrow: "Recupero" },
  { query: "anabolic steroid athletes health risk", eyebrow: "Farmacologia sportiva" },
  { query: "doping performance enhancing substances athletes", eyebrow: "Farmacologia sportiva" },
];

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;

// Slot di 2 ore da inizio anno: cambia argomento ad ogni chiamata del cron
// (ogni 2 ore) invece che una volta al giorno, altrimenti con 12 chiamate al
// giorno si ripeterebbe sempre lo stesso argomento per 12 tentativi di fila.
function twoHourSlot() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now - start) / (2 * 3600 * 1000));
}

async function esearch(query) {
  const url = `${NCBI_BASE}/esearch.fcgi?db=pubmed&retmode=json&retmax=3&sort=date&datetype=pdat&reldate=730&term=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`esearch ${res.status}`);
  const data = await res.json();
  return data.esearchresult?.idlist ?? [];
}

// efetch in XML, parsing manuale con regex mirate sui tag noti di PubMed —
// niente libreria XML esterna: il formato di ArticleTitle/AbstractText è
// stabile e i tag non annidano altri tag omonimi in questo contesto.
async function efetchAbstract(pmid) {
  const url = `${NCBI_BASE}/efetch.fcgi?db=pubmed&id=${pmid}&rettype=abstract&retmode=xml`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`efetch ${res.status}`);
  const xml = await res.text();
  const strip = (s) => (s || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const title = strip(xml.match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/)?.[1]);
  const abstractParts = [...xml.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g)].map((m) => strip(m[1]));
  const journal = strip(xml.match(/<Title>([\s\S]*?)<\/Title>/)?.[1]);
  const year = xml.match(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/)?.[1];
  return { title, abstract: abstractParts.join(" "), journal, year };
}

function firstSentences(text, count) {
  const sentences = (text || "").split(/(?<=[.!?])\s+/).filter(Boolean);
  return sentences.slice(0, count).join(" ");
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  // Dado casuale ad ogni chiamata: solo il 40% delle 12 chiamate giornaliere
  // pubblica davvero, così l'orario di uscita non è mai lo stesso — niente
  // "sempre alle 7", più simile a un feed che vive tutto il giorno.
  if (Math.random() > POST_PROBABILITY) {
    return new Response(JSON.stringify({ inserted: 0, reason: "skipped-this-round" }));
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  // Diagnostica minima nella risposta stessa: gli unici log altrimenti
  // visibili sono nella dashboard Supabase, non raggiungibile da qui — un
  // problema reale (bug useCallback dimenticato in passato, tabella mai
  // creata) va scoperto anche solo leggendo l'HTTP response del cron.
  const debug = [];

  // Pubblica fino a 2 studi nuovi per un dato argomento (news+tips per
  // ciascuno = fino a 4 righe). Ritorna quanti studi ha davvero pubblicato,
  // così il chiamante sa se deve tentare un argomento di riserva.
  async function publishFromTopic(topic) {
    let pmids = [];
    try {
      pmids = await esearch(topic.query);
    } catch (err) {
      console.error("PERFORM: esearch fallita", topic.query, err.message);
      debug.push(`esearch fallita (${topic.query}): ${err.message}`);
      return 0;
    }
    if (pmids.length === 0) { debug.push(`esearch 0 risultati (${topic.query})`); return 0; }

    const { data: existing, error: existingError } = await supabase.from("coach_news_tips").select("source_query").in("source_query", pmids);
    if (existingError) debug.push(`select dedup fallita: ${existingError.message}`);
    const alreadyPosted = new Set((existing ?? []).map((r) => r.source_query));
    const newPmids = pmids.filter((id) => !alreadyPosted.has(id));
    if (newPmids.length === 0) { debug.push(`tutti i pmid già pubblicati (${topic.query})`); return 0; }

    let inserted = 0;
    for (const pmid of newPmids.slice(0, 2)) { // un paio di studi nuovi a giro, non un'inondazione
      let article;
      try {
        article = await efetchAbstract(pmid);
      } catch (err) {
        console.error("PERFORM: errore efetch", pmid, err);
        debug.push(`efetch fallita (${pmid}): ${err.message}`);
        continue;
      }
      if (!article.title || !article.abstract) { debug.push(`efetch senza title/abstract (${pmid})`); continue; }

      const summary = firstSentences(article.abstract, 3);
      const sourceLine = article.journal && article.year ? ` (${article.journal}, ${article.year})` : "";
      const now = new Date().toISOString();

      const { error: newsError } = await supabase.from("coach_news_tips").insert({
        channel: "news",
        eyebrow: topic.eyebrow,
        title: article.title,
        body: `${summary}${sourceLine}`,
        body_extended: [article.abstract, sourceLine ? `Pubblicato su${sourceLine}.` : null].filter(Boolean),
        source_query: pmid,
        published_at: now,
      });
      if (newsError) { console.error("PERFORM: errore insert news", newsError); debug.push(`insert news fallito (${pmid}): ${newsError.message}`); continue; }

      // Stesso studio, riformulato come consiglio pratico: nessuna
      // interpretazione aggiuntiva, solo l'inquadramento "cosa significa per
      // te" seguito dal riassunto reale — mai un consiglio inventato di sana pianta.
      const { error: tipsError } = await supabase.from("coach_news_tips").insert({
        channel: "tips",
        eyebrow: topic.eyebrow,
        title: `Cosa significa per te: ${article.title}`,
        body: `${summary}${sourceLine}`,
        body_extended: [article.abstract, sourceLine ? `Pubblicato su${sourceLine}.` : null].filter(Boolean),
        source_query: pmid,
        published_at: now,
      });
      if (tipsError) { console.error("PERFORM: errore insert tips", tipsError); debug.push(`insert tips fallito (${pmid}): ${tipsError.message}`); }

      inserted++;
    }
    return inserted;
  }

  const primaryTopic = TOPICS[twoHourSlot() % TOPICS.length];
  let inserted = await publishFromTopic(primaryTopic);
  let usedTopic = primaryTopic;

  // L'argomento del turno aveva già tutto pubblicato di recente (o PubMed
  // non ha risultati nuovi): prima di rinunciare fino al prossimo giro (2h
  // dopo, col 40% di probabilità — poteva restare "silenzioso" per giorni
  // su un argomento esaurito) prova UN argomento di riserva scelto a caso
  // fra gli altri 13, invece di arrendersi subito.
  if (inserted === 0) {
    const fallback = TOPICS[Math.floor(Math.random() * TOPICS.length)];
    if (fallback.query !== primaryTopic.query) {
      inserted = await publishFromTopic(fallback);
      usedTopic = fallback;
    }
  }

  return new Response(JSON.stringify({ inserted, topic: usedTopic.query, debug }), { headers: { "Content-Type": "application/json" } });
});
