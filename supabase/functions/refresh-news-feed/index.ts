// PERFORM — Edge Function: refresh-news-feed
// ============================================================================
// Chiamata una volta al giorno da un job pg_cron (stesso pattern
// x-cron-secret di streak-reminder/monthly-xp-snapshot). Pesca studi REALI e
// recenti da PubMed (l'archivio pubblico di letteratura biomedica del NIH
// americano, gratuito, senza chiave API) su una rotazione di argomenti
// allenamento/alimentazione/integrazione/recupero/farmacologia sportiva, e
// pubblica due righe in coach_news_tips per ogni studio nuovo trovato:
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

// Una rotazione di argomenti reali per i 5 temi richiesti: allenamento,
// alimentazione, integrazione, recupero atleti, farmacologia sportiva.
// Un giorno dell'anno = un argomento, per non ripescare sempre lo stesso.
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

function dayOfYear() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now - start) / 86400000);
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

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const topic = TOPICS[dayOfYear() % TOPICS.length];
  let pmids = [];
  try {
    pmids = await esearch(topic.query);
  } catch (err) {
    return new Response(JSON.stringify({ error: `esearch fallita: ${err.message}` }), { status: 502 });
  }
  if (pmids.length === 0) return new Response(JSON.stringify({ inserted: 0, reason: "no-results", topic: topic.query }));

  // Evita duplicati: non ripubblicare uno studio già presente (source_query
  // qui è il pmid stesso, univoco per articolo — vedi insert sotto).
  const { data: existing } = await supabase.from("coach_news_tips").select("source_query").in("source_query", pmids);
  const alreadyPosted = new Set((existing ?? []).map((r) => r.source_query));
  const newPmids = pmids.filter((id) => !alreadyPosted.has(id));
  if (newPmids.length === 0) return new Response(JSON.stringify({ inserted: 0, reason: "already-posted", topic: topic.query }));

  let inserted = 0;
  for (const pmid of newPmids.slice(0, 1)) { // un solo studio nuovo al giorno, non un'inondazione
    let article;
    try {
      article = await efetchAbstract(pmid);
    } catch (err) {
      console.error("PERFORM: errore efetch", pmid, err);
      continue;
    }
    if (!article.title || !article.abstract) continue;

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
    if (newsError) { console.error("PERFORM: errore insert news", newsError); continue; }

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
    if (tipsError) console.error("PERFORM: errore insert tips", tipsError);

    inserted++;
  }

  return new Response(JSON.stringify({ inserted, topic: topic.query }), { headers: { "Content-Type": "application/json" } });
});
