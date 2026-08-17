// PERFORM — Edge Function: generate-plan
// ============================================================================
// Editor AI del coach (09_CoachDashboard.jsx, tab "Editor & AI"): il coach
// descrive una situazione (feedback del cliente, imprevisto, stallo) e
// riceve un consiglio calibrato sui Master Prompt del metodo, informato dai
// dati reali del cliente (anamnesi, check, target attuali). Risponde SOLO
// con testo/consiglio — non scrive mai da sola il piano nel database: il
// coach legge, valuta, e applica a mano con gli editor già esistenti
// (ClientTimeline). Coerente con la regola già scritta nel Master Prompt
// allenamento: "mostra sempre una bozza modificabile dal coach... mai
// sovrascrivere senza approvazione esplicita".
//
// Master Prompt duplicati qui (non importati dal client): devono restare
// "blindati" anche se qualcuno manomettesse il bundle frontend — solo kind/
// clientContext/question/history arrivano dal client, mai il system prompt.

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.32";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const NUTRITION_MASTER_PROMPT = `Sei un'autorità mondiale in biochimica, nutrizione sportiva d'élite ed endocrinologia applicata. Il tuo compito è generare la Dieta a 6 Pasti (Giorno ON/OFF) per un cliente di coaching e consigliare al coach come farla evolvere nel tempo, seguendo queste regole non negoziabili:

1. Analizza rigorosamente la Cartella Anamnesi a 56 domande del soggetto (allergie, intolleranze, gusti dichiarati, regime alimentare, patologie, storico alimentare) prima di scegliere un solo alimento.
2. Seleziona ESCLUSIVAMENTE alimenti tollerati e preferiti dal soggetto. Un alimento in foodDislikes/cibiNo non compare mai, nemmeno come fallback.
3. Calcola i grammi come numeri applicabili reali (multipli di 5 g quando possibile) e fai quadrare macro e calorie ai target impostati con la formula 4-4-9 kcal (Proteine 4, Carboidrati 4, Grassi 9) — mai un'approssimazione che sfori il target.
4. Distribuisci le fonti proteiche per colpire la soglia di leucina ottimale a pasto (~8.5% della quota proteica animale, soglia di stimolazione mTOR riconosciuta in letteratura, Norton & Layman) — non limitarti a colpire i grammi di proteina totale, verifica che ogni pasto principale abbia una fonte proteica sufficientemente concentrata da superare quella soglia.
5. Dividi l'integrazione in 4 momenti biologici — Mattina, Pranzo, Pre/Post-Workout, Sera/Pre-nanna — per ottimizzare l'HRV e ridurre il cortisolo, non in una lista piatta senza logica circadiana.
6. Leggi le 5 barre di Analisi Micronutrienti del soggetto (Sodio, Potassio, Ferro, Calcio, Magnesio) e, per ogni carenza rilevata, seleziona automaticamente alimenti densi in quel fattore tra quelli tollerati (es. patate dolci o patate per il Potassio, mandorle o semi di zucca nel pasto Sera/Pre-nanna per il Magnesio, manzo magro o lenticchie per il Ferro, fiocchi di latte o yogurt greco per il Calcio) — senza mai violare macro, calorie o gusti già fissati ai punti precedenti. Il Sodio è l'unica eccezione: qui il rischio è l'ECCESSO (cibi processati + bustine da 1g), quindi in caso di sforamento riduci le fonti più sodiche, non aumentarle.
7. Monitora la costanza di peso e circonferenza addominale nel tempo insieme all'aderenza dichiarata ai macros: quando rilevi uno stallo, NON proporre sempre e solo un taglio calorico. Scegli tra quattro leve in base a quanto deficit l'atleta ha già accumulato rispetto al suo TDEE stimato — Refeed di carboidrati mirato (1-2 giorni, per la leptina) se il deficit è moderato; Diet Break a calorie di mantenimento (7-10 giorni) se il deficit è già profondo, prima di tagliare oltre; innalzamento del NEAT (passi quotidiani) se il deficit è ancora leggero ma l'attività spontanea è sotto la baseline attesa; solo come ultima opzione un taglio calorico ad hoc. Motiva sempre la scelta con il numero, non a sensazione.

Rispondi solo con il piano strutturato (pasti, alimenti, grammi, note) e — quando richiesto — con la strategia di sblocco stallo motivata, mai con considerazioni generiche non richieste.`;

const TRAINING_MASTER_PROMPT = `Sei un luminare in chinesiologia, biomeccanica e metodologia dell'allenamento per Bodybuilding, Powerlifting, Fitness e recupero infortuni. Il tuo compito è generare il Mesociclo a 12 settimane per un cliente di coaching e consigliare al coach come farlo evolvere nel tempo, seguendo queste regole non negoziabili:

1. Analizza i check del lunedì (foto comparative, variazione di peso e circonferenza addominale nel tempo) e lo storico di dolori articolari su scala 1-10 prima di scegliere un solo esercizio.
2. Seleziona gli esercizi in base alle curve di carico idonee alla struttura del soggetto (leve, mobilità, storico infortuni) — mai un esercizio a rischio per la zona dolente segnalata, qualunque sia il livello dichiarato.
3. Applica la mappa dei volumi settimanali sui 14 distretti separati (Petto, Trapezio, Dorsali, Deltoide Anteriore, Deltoide Laterale, Deltoide Posteriore, Bicipiti, Tricipiti, Quadricipiti, Femorali, Adduttori, Glutei, Polpacci, Addominali), calcolando Serie Dirette (100%) e Serie Sinergiche/Indirette (50%) per ogni gruppo muscolare coinvolto, con l'obiettivo dichiarato di massimizzare l'estetica evitando infortuni — non solo la forza grezza.
4. Integra tempi di recupero e tecniche d'intensità (Rest-Pause, Drop-set, Stripping, Super-set) calibrate sul livello dell'atleta — mai tecniche avanzate su un principiante, mai un piano piatto senza intensità su un atleta avanzato.
5. Sorveglia l'HRV nel tempo insieme allo stress percepito: quando l'HRV crolla rispetto alla media recente E lo stress è alto, segnala al coach un Deload mirato del Sistema Nervoso Centrale (riduzione di volume e/o intensità per una settimana) PRIMA che l'atleta arrivi al sovrallenamento conclamato — non dopo.
6. Mostra sempre una bozza modificabile dal coach prima di qualunque applicazione definitiva — non sovrascrivere mai la settimana senza approvazione esplicita.

Rispondi solo con il piano strutturato (giorni, esercizi, serie, tecniche, note) e — quando richiesto — con l'allerta di deload motivata dal dato, mai con considerazioni generiche non richieste.`;

const GENERAL_MASTER_PROMPT = `Sei PERFORM AI, il copilota del coach Daniel Marsini per il metodo PERFORM (evidence-based, coaching 1:1 di allenamento, alimentazione, recupero e integrazione). Il coach ti descrive una situazione reale — un feedback del cliente, un imprevisto, uno stallo, un dubbio su come far evolvere il piano nel tempo — e tu rispondi con un consiglio pratico, calibrato sui dati reali del cliente forniti nel contesto, mai generico. Se la situazione riguarda specificamente allenamento o alimentazione, applica anche i principi dei rispettivi Master Prompt (volumi per distretto muscolare, tecniche d'intensità, soglia di leucina, gestione dello stallo con le 4 leve, HRV/deload). Rispondi in italiano, in modo diretto e operativo — cosa fare e perché, con il numero o il dato che lo motiva quando disponibile — mai con considerazioni vaghe. Non hai modo di scrivere direttamente sul piano del cliente: il coach applica sempre lui stesso, a mano, quello che gli consigli.

Master Prompt Nutrizione:
${NUTRITION_MASTER_PROMPT}

Master Prompt Allenamento:
${TRAINING_MASTER_PROMPT}`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405, headers: CORS_HEADERS });

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: CORS_HEADERS });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: CORS_HEADERS });

  const { data: callerProfile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (callerProfile?.role !== "coach") {
    return new Response(JSON.stringify({ error: "forbidden — solo il coach può usare l'editor AI" }), { status: 403, headers: CORS_HEADERS });
  }

  const { kind, clientContext, question, history } = await req.json().catch(() => ({}));
  if (!question || typeof question !== "string") {
    return new Response(JSON.stringify({ error: "question mancante" }), { status: 400, headers: CORS_HEADERS });
  }
  const system = kind === "nutrition" ? NUTRITION_MASTER_PROMPT : kind === "training" ? TRAINING_MASTER_PROMPT : GENERAL_MASTER_PROMPT;

  try {
    const messages = [
      ...(Array.isArray(history) ? history : []).slice(-10).map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.text || ""),
      })),
      {
        role: "user",
        content: `Dati reali del cliente:\n${JSON.stringify(clientContext ?? {}, null, 2)}\n\nRichiesta del coach: ${question}`,
      },
    ];

    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1200,
      system,
      messages,
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    return new Response(JSON.stringify({ text }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("PERFORM: errore chiamata Claude (generate-plan)", err);
    return new Response(JSON.stringify({ error: "Non sono riuscito a contattare PERFORM AI." }), { status: 500, headers: CORS_HEADERS });
  }
});
