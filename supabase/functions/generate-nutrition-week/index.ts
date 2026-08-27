// PERFORM — Edge Function: generate-nutrition-week
// ============================================================================
// Editor alimentazione del coach (09_CoachDashboard.jsx, WeekDietEditor):
// il coach ha GIÀ impostato il target kcal/macro (Proteine/Carbo/Grassi) per
// il giorno ON e/o OFF di un cliente — questa funzione riempie i pasti
// (alimenti + grammature) per arrivarci, senza che il coach debba fare i
// calcoli a mano. Il target stesso non viene mai toccato: solo i pasti sono
// generati dall'AI, il coach li rivede e preme "Salva modifiche" come
// sempre (che scrive comunque solo il target su nutrition_targets — i
// pasti restano stato locale dell'editor, stessa architettura di oggi).
//
// Il vocabolario alimenti (FOOD_DB, ~100 voci) vive lato client
// (09_CoachDashboard.jsx, non esportato) — arriva nel corpo della richiesta
// invece di essere duplicato qui: sono dati di riferimento, non un segreto,
// e restano sempre sincronizzati con quello che il client usa davvero.

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.32";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const COST_PER_INPUT_TOKEN = 2 / 1_000_000;
const COST_PER_OUTPUT_TOKEN = 10 / 1_000_000;
const SAFETY_CAP_USD = 10.0;
const MAX_NOTES_CHARS = 1000;
const MAX_FOOD_DB_ENTRIES = 200;

function currentMonthKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Master Prompt Nutrizione condensato (stessi principi clinici di
// generate-plan/NUTRITION_MASTER_PROMPT) + contratto JSON strutturato al
// posto del consiglio testuale libero.
function buildSystemPrompt(foodNames) {
  return `Sei un'autorità in biochimica e nutrizione sportiva. Il coach ti ha GIÀ dato il target di macro (proteine/carboidrati/grassi in grammi) per uno o due profili giornalieri (ON = giorno di allenamento, OFF = giorno di riposo) di un cliente. Il tuo compito è riempire i pasti (6 pasti per profilo) con alimenti e grammature che raggiungano quei target, seguendo queste regole non negoziabili:

1. Seleziona ESCLUSIVAMENTE alimenti tollerati e preferiti dal cliente (mai un alimento elencato tra i "non graditi"), scegliendo tra il vocabolario fornito qui sotto — usa il campo "foodKey" con il nome ESATTO, verbatim, di uno di questi alimenti: ${foodNames.join(", ")}.
2. Se nessun alimento del vocabolario è adatto per completare i macro (es. serve un integratore o un alimento specifico non in lista), puoi usare un elemento personalizzato: "foodKey": null, "customName", "customP100"/"customC100"/"customF100" (grammi per 100g) — usalo solo come eccezione, non come scelta di default.
3. Calcola i grammi di ogni alimento (multipli di 5g quando possibile) in modo che la somma di tutti i pasti del profilo si avvicini il più possibile al target dato (proteine/carboidrati/grassi) — non è necessario centrarlo al grammo, ma resta entro un margine ragionevole.
4. Distribuisci le fonti proteiche principali nei pasti principali (non tutte concentrate in uno solo).
5. Genera ESATTAMENTE 6 pasti per ogni profilo richiesto, con orari sensati distribuiti nella giornata (es. 07:30, 10:30, 13:00, 16:00, 19:00, 21:30).

Rispondi SOLO con un oggetto JSON valido, nessun altro testo, con questa struttura esatta:
{"ON": null|{"meals": [{"name": "Colazione", "time": "07:30", "items": [{"foodKey": "...", "grams": 100}, {"foodKey": null, "customName": "...", "customP100": 0, "customC100": 0, "customF100": 0, "grams": 50}]}]}, "OFF": null|{"meals": [...]}}

Genera SOLO i profili (ON/OFF) per cui il coach ti ha dato un target — l'altro resta "null".`;
}

function isValidItem(it, foodNameSet) {
  if (!it || !Number.isFinite(Number(it.grams)) || Number(it.grams) <= 0) return false;
  if (it.foodKey) return foodNameSet.has(it.foodKey);
  return typeof it.customName === "string" && it.customName.trim() &&
    Number.isFinite(Number(it.customP100)) && Number.isFinite(Number(it.customC100)) && Number.isFinite(Number(it.customF100));
}

function isValidProfile(profile, foodNameSet) {
  if (profile === null || profile === undefined) return true;
  if (typeof profile !== "object" || !Array.isArray(profile.meals) || profile.meals.length === 0) return false;
  return profile.meals.every((m) =>
    m && typeof m.name === "string" && m.name.trim() && typeof m.time === "string" &&
    Array.isArray(m.items) && m.items.every((it) => isValidItem(it, foodNameSet)));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405, headers: CORS_HEADERS });

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: CORS_HEADERS });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: CORS_HEADERS });

  if ((user.email || "").trim().toLowerCase() !== "danielmarsini@coach.com") {
    return new Response(JSON.stringify({ error: "forbidden — solo il coach può usare l'editor AI" }), { status: 403, headers: CORS_HEADERS });
  }

  const { clientContext, notes, foodDb } = await req.json().catch(() => ({}));
  const trimmedNotes = typeof notes === "string" ? notes.slice(0, MAX_NOTES_CHARS) : "";
  const foods = Array.isArray(foodDb) ? foodDb.slice(0, MAX_FOOD_DB_ENTRIES) : [];
  if (foods.length === 0) {
    return new Response(JSON.stringify({ error: "vocabolario alimenti mancante" }), { status: 400, headers: CORS_HEADERS });
  }
  const foodNameSet = new Set(foods.map((f) => f.name));

  const month = currentMonthKey();
  const { data: usageRow } = await admin.from("ai_usage_monthly").select("cost_usd, requests").eq("user_id", user.id).eq("month", month).maybeSingle();
  const spentSoFar = Number(usageRow?.cost_usd ?? 0);
  if (spentSoFar >= SAFETY_CAP_USD) {
    return new Response(JSON.stringify({ error: `Raggiunto il tetto di sicurezza mensile dell'editor AI (${SAFETY_CAP_USD}$) — si azzera il 1° del prossimo mese.` }), { status: 429, headers: CORS_HEADERS });
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4000,
      system: buildSystemPrompt(foods.map((f) => f.name)),
      messages: [{
        role: "user",
        content: `Vocabolario alimenti disponibili (nome: kcal/proteine/carbo/grassi per 100g):\n${JSON.stringify(foods)}\n\nDati reali del cliente:\n${JSON.stringify(clientContext ?? {}, null, 2)}\n\nNote aggiuntive del coach: ${trimmedNotes || "(nessuna)"}`,
      }],
    });

    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("risposta senza JSON valido");
    const parsed = JSON.parse(match[0]);
    if (!isValidProfile(parsed.ON, foodNameSet) || !isValidProfile(parsed.OFF, foodNameSet)) {
      throw new Error("struttura pasti non valida");
    }

    const cost = response.usage.input_tokens * COST_PER_INPUT_TOKEN + response.usage.output_tokens * COST_PER_OUTPUT_TOKEN;
    await admin.from("ai_usage_monthly").upsert(
      { user_id: user.id, month, cost_usd: spentSoFar + cost, requests: Number(usageRow?.requests ?? 0) + 1, updated_at: new Date().toISOString() },
      { onConflict: "user_id,month" },
    );

    return new Response(JSON.stringify({ ON: parsed.ON ?? null, OFF: parsed.OFF ?? null }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("PERFORM: errore generazione bozza alimentazione AI", err);
    return new Response(JSON.stringify({ error: "Non sono riuscito a generare una bozza valida. Riprova, eventualmente con note più semplici." }), { status: 500, headers: CORS_HEADERS });
  }
});
