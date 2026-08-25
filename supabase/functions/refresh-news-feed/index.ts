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
// di letteratura biomedica del NIH americano, gratuito, senza chiave API).
//
// BUG PRESO: News e Tips erano praticamente identici — stesso studio,
// stesso riassunto, solo il titolo di Tips aveva un prefisso "Cosa
// significa per te:". Ora sono due rotazioni di argomenti PubMed
// indipendenti, con due trasformazioni diverse dello stesso tipo di fonte
// (mai contenuto inventato, sempre uno studio reale sotto):
//   - channel 'news' → NEWS_TOPICS (allenamento/alimentazione/
//     integrazione/recupero/farmacologia/ormoni/fisiologia/anatomia),
//     tradotto fedelmente come notizia scientifica.
//   - channel 'tips' → TIPS_TOPICS (tecnica esecutiva, timing pasti,
//     igiene del sonno, programmazione pratica, mobilità, idratazione,
//     recupero tra sedute), riformulato in italiano come consiglio
//     applicabile SUBITO — sempre ancorato ai risultati reali dello
//     studio, mai un suggerimento non supportato dal testo originale.
// source_query resta il link "leggi lo studio originale" verso PubMed (vedi
// pubmedSearchUrl in 06_NewsTipsView.jsx, già esistente).

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.32";

const NCBI_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const POST_PROBABILITY = 0.4;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// Gli abstract PubMed arrivano sempre in inglese — pubblico dell'app
// italiano, quindi vanno tradotti prima di pubblicare. Un modello economico
// e veloce basta per una traduzione fedele (non serve ragionamento, solo
// linguistica): stesso ANTHROPIC_API_KEY già usato da ask-perform-ai/
// generate-plan, ma un modello diverso qui perché il compito è più semplice
// e gira in automatico più volte al giorno senza supervisione umana.
async function translateToItalian(title, abstract) {
  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 900,
    messages: [{
      role: "user",
      content: `Traduci in italiano professionale e naturale, per un pubblico di sportivi/appassionati di fitness. Traduzione fedele, senza aggiungere interpretazioni, consigli o dati non presenti nel testo originale. Rispondi SOLO con un oggetto JSON valido, nessun altro testo, con esattamente questi due campi:\n{"title": "...", "abstract": "..."}\n\nTitolo originale:\n${title}\n\nAbstract originale:\n${abstract}`,
    }],
  });
  const text = msg.content?.[0]?.type === "text" ? msg.content[0].text : "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("risposta di traduzione senza JSON");
  const parsed = JSON.parse(match[0]);
  if (!parsed.title || !parsed.abstract) throw new Error("traduzione incompleta");
  return parsed;
}

// Stesso principio di translateToItalian ma per Tips: non una traduzione
// fedele, una RIFORMULAZIONE in consiglio pratico attuabile — il coach
// vuole che Tips dica "cosa fare in pratica", non "cosa dice lo studio".
// Resta ancorato SOLO ai risultati reali dell'abstract, esplicitamente
// vietato aggiungere consigli non supportati dal testo.
//
// Richiesta esplicita del coach: il titolo deve sempre iniziare con una
// delle 4 forme azionabili sotto — chi scorre il feed capisce SUBITO se
// il consiglio gli serve, senza dover aprire l'articolo. body resta la
// versione breve per la card nel feed; body_extended è un'elaborazione
// GENUINAMENTE più lunga (passi concreti, errori comuni, quando si
// applica), non una copia di body — prima capitava che i due campi
// coincidessero, rendendo "Approfondisci" inutile (mostrava lo stesso
// identico testo, solo con un font più grande).
async function craftPracticalTip(title, abstract) {
  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1400,
    messages: [{
      role: "user",
      content: `Trasforma questo studio scientifico in un consiglio pratico per chi si allena e segue un percorso fitness. Scrivi in italiano, tono diretto e concreto, spiegando COSA FARE in pratica — basandoti SOLO sui risultati reali riportati nell'abstract, senza aggiungere consigli, numeri o affermazioni non presenti nel testo originale.

Il titolo DEVE iniziare con una di queste 4 forme (scegli quella più naturale per questo consiglio, poi completa con l'argomento specifico):
- "Come fare [azione]" — es. "Come fare il riscaldamento prima dello squat"
- "Come non fare [azione]" — es. "Come non fare la fase eccentrica in panca"
- "Cosa fare quando [situazione]" — es. "Cosa fare quando il sonno scende sotto le 6 ore"
- "Cosa non fare quando [situazione]" — es. "Cosa non fare quando aumenti il carico"

Rispondi SOLO con un oggetto JSON valido, nessun altro testo, con esattamente questi campi:
{"title": "il titolo nel formato richiesto sopra", "body": "2-3 frasi, la versione breve per l'anteprima nel feed", "body_extended": ["primo paragrafo: cosa fare in pratica, passo dopo passo", "secondo paragrafo: l'errore più comune da evitare o quando il consiglio si applica davvero, sempre ancorato ai risultati dello studio"]}

Titolo studio originale:
${title}

Abstract originale:
${abstract}`,
    }],
  });
  const text = msg.content?.[0]?.type === "text" ? msg.content[0].text : "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("risposta consiglio pratico senza JSON");
  const parsed = JSON.parse(match[0]);
  if (!parsed.title || !parsed.body || !parsed.body_extended?.length) throw new Error("consiglio pratico incompleto");
  return parsed;
}

// News: scoperte scientifiche professionali — allenamento, alimentazione,
// integrazione, recupero, farmacologia sportiva, ormoni, fisiologia,
// anatomia. L'argomento cambia ogni 2 ore (stessa cadenza del cron).
const NEWS_TOPICS = [
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
  { query: "testosterone cortisol hormonal response exercise", eyebrow: "Ormoni" },
  { query: "growth hormone insulin exercise adaptation", eyebrow: "Ormoni" },
  { query: "skeletal muscle hypertrophy signaling mechanisms", eyebrow: "Fisiologia" },
  { query: "muscle fiber type physiology adaptation training", eyebrow: "Fisiologia" },
  { query: "skeletal muscle anatomy structure function", eyebrow: "Anatomia" },
  { query: "tendon ligament joint biomechanics exercise", eyebrow: "Anatomia" },
];

// Tips: consigli pratici da studi con un'applicazione diretta — tecnica
// esecutiva, timing pasti, sonno, programmazione, mobilità, idratazione,
// recupero tra sedute. Rotazione indipendente da NEWS_TOPICS: stesso
// principio (studio reale da PubMed), fonti diverse, orientate al "cosa
// fare" invece che al "cosa si è scoperto".
const TIPS_TOPICS = [
  { query: "resistance training exercise technique form injury prevention", eyebrow: "Tecnica esecutiva" },
  { query: "range of motion resistance training muscle growth", eyebrow: "Tecnica esecutiva" },
  { query: "warm-up protocol injury prevention athletic performance", eyebrow: "Riscaldamento" },
  { query: "nutrient timing meal frequency athletic performance", eyebrow: "Alimentazione pratica" },
  { query: "protein distribution meal timing muscle protein synthesis", eyebrow: "Alimentazione pratica" },
  { query: "sleep hygiene intervention athletes practical", eyebrow: "Sonno" },
  { query: "resistance training program design practical recommendations", eyebrow: "Programmazione" },
  { query: "training frequency volume practical recommendations hypertrophy", eyebrow: "Programmazione" },
  { query: "stretching mobility flexibility practical guidelines athletes", eyebrow: "Mobilità" },
  { query: "hydration fluid intake practical guidelines exercise performance", eyebrow: "Idratazione" },
  { query: "recovery strategies between training sessions practical", eyebrow: "Recupero pratico" },
  { query: "deload training practical recommendations overtraining prevention", eyebrow: "Recupero pratico" },
  // Aggiunti per coprire i dubbi più discussi online (forum, Reddit,
  // TikTok fitness) mantenendo comunque solo fonti scientifiche reali da
  // PubMed dietro ogni consiglio — mai uno spunto preso direttamente da un
  // social senza uno studio verificabile a supporto.
  { query: "training plateau strength progression practical strategies", eyebrow: "Progressione" },
  { query: "spot reduction fat loss myth localized", eyebrow: "Miti da sfatare" },
  { query: "rest day necessity muscle recovery training frequency", eyebrow: "Programmazione" },
  { query: "minimum effective dose resistance training volume", eyebrow: "Programmazione" },
  { query: "common exercise form errors squat deadlift injury", eyebrow: "Tecnica esecutiva" },
  { query: "muscle soreness DOMS myth performance indicator", eyebrow: "Miti da sfatare" },
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

  // Pubblica fino a 2 studi nuovi per un dato argomento sul canale dato.
  // Dedup SCOPED al canale: news e tips pescano da rotazioni diverse ma un
  // pmid potrebbe capitare in entrambe — non deve bloccare Tips solo
  // perché quello stesso studio è già uscito su News (e viceversa).
  async function publishFromTopic(channel, topic, transform) {
    let pmids = [];
    try {
      pmids = await esearch(topic.query);
    } catch (err) {
      console.error("PERFORM: esearch fallita", topic.query, err.message);
      debug.push(`[${channel}] esearch fallita (${topic.query}): ${err.message}`);
      return 0;
    }
    if (pmids.length === 0) { debug.push(`[${channel}] esearch 0 risultati (${topic.query})`); return 0; }

    const { data: existing, error: existingError } = await supabase.from("coach_news_tips")
      .select("source_query").eq("channel", channel).in("source_query", pmids);
    if (existingError) debug.push(`[${channel}] select dedup fallita: ${existingError.message}`);
    const alreadyPosted = new Set((existing ?? []).map((r) => r.source_query));
    const newPmids = pmids.filter((id) => !alreadyPosted.has(id));
    if (newPmids.length === 0) { debug.push(`[${channel}] tutti i pmid già pubblicati (${topic.query})`); return 0; }

    let inserted = 0;
    for (const pmid of newPmids.slice(0, 2)) { // un paio di studi nuovi a giro, non un'inondazione
      let article;
      try {
        article = await efetchAbstract(pmid);
      } catch (err) {
        console.error("PERFORM: errore efetch", pmid, err);
        debug.push(`[${channel}] efetch fallita (${pmid}): ${err.message}`);
        continue;
      }
      if (!article.title || !article.abstract) { debug.push(`[${channel}] efetch senza title/abstract (${pmid})`); continue; }

      let row;
      try {
        row = await transform(article);
      } catch (err) {
        console.error(`PERFORM: errore trasformazione ${channel}`, pmid, err);
        debug.push(`[${channel}] trasformazione fallita (${pmid}): ${err.message}`);
        row = { title: article.title, body: firstSentences(article.abstract, 3), bodyExtended: [article.abstract] }; // meglio inglese che niente
      }

      // News legge come una notizia scientifica: citazione (Rivista, Anno) in
      // chiaro nel testo, coerente con quel formato. Tips deve leggersi come
      // un consiglio pratico, non una citazione accademica in mezzo al
      // consiglio — niente "(Journal, Year)" incollato al testo, la fonte
      // resta comunque verificabile mai nascosta, solo spostata nel link
      // discreto sotto (SourceLink, vedi 06_NewsTipsView.jsx).
      const sourceLine = article.journal && article.year ? ` (${article.journal}, ${article.year})` : "";
      const isNews = channel === "news";
      const { error: insertError } = await supabase.from("coach_news_tips").insert({
        channel,
        eyebrow: topic.eyebrow,
        title: row.title,
        body: isNews ? `${row.body}${sourceLine}` : row.body,
        body_extended: isNews
          ? [...row.bodyExtended, sourceLine ? `Fonte: studio reale pubblicato su${sourceLine}.` : null].filter(Boolean)
          : row.bodyExtended,
        source_query: pmid,
        published_at: new Date().toISOString(),
      });
      if (insertError) { console.error(`PERFORM: errore insert ${channel}`, insertError); debug.push(`[${channel}] insert fallito (${pmid}): ${insertError.message}`); continue; }
      inserted++;
    }
    return inserted;
  }

  // News: traduzione fedele, presentata come notizia scientifica.
  async function newsTransform(article) {
    const it = await translateToItalian(article.title, article.abstract);
    return { title: it.title, body: firstSentences(it.abstract, 3), bodyExtended: [it.abstract] };
  }

  // Tips: riformulazione in consiglio pratico attuabile, sempre ancorata
  // ai risultati reali dello studio. bodyExtended arriva da body_extended
  // (2 paragrafi genuinamente più approfonditi di body, non una copia —
  // vedi craftPracticalTip) così "Approfondisci" mostra davvero qualcosa
  // in più della card nel feed.
  async function tipsTransform(article) {
    const tip = await craftPracticalTip(article.title, article.abstract);
    return { title: tip.title, body: tip.body, bodyExtended: tip.body_extended };
  }

  async function publishChannel(channel, topics, transform) {
    const primaryTopic = topics[twoHourSlot() % topics.length];
    let inserted = await publishFromTopic(channel, primaryTopic, transform);
    let usedTopic = primaryTopic;
    // L'argomento del turno aveva già tutto pubblicato di recente (o PubMed
    // non ha risultati nuovi): prova UN argomento di riserva scelto a caso
    // invece di restare silenzioso fino al prossimo giro.
    if (inserted === 0) {
      const fallback = topics[Math.floor(Math.random() * topics.length)];
      if (fallback.query !== primaryTopic.query) {
        inserted = await publishFromTopic(channel, fallback, transform);
        usedTopic = fallback;
      }
    }
    return { inserted, topic: usedTopic.query };
  }

  const news = await publishChannel("news", NEWS_TOPICS, newsTransform);
  const tips = await publishChannel("tips", TIPS_TOPICS, tipsTransform);

  return new Response(JSON.stringify({ news, tips, debug }), { headers: { "Content-Type": "application/json" } });
});
