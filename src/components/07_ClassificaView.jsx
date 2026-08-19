import React, { useState, useEffect, useMemo } from 'react';
import { xpToLevelInfo, fetchMonthlyLeaderboard } from '../lib/coachingData.js';
import Portal from './Portal.jsx';

const ITALIAN_MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
function monthKeyLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return { monthName: ITALIAN_MONTHS[m - 1], label: `${ITALIAN_MONTHS[m - 1][0].toUpperCase()}${ITALIAN_MONTHS[m - 1].slice(1)} ${y}` };
}
function shiftMonthKey(monthKey, delta) {
  const [y, m] = monthKey.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}
// Board di un mese (reale) nella stessa forma { top10, userResult } che il
// resto del componente già consuma per la board demo — mappa xpThisMonth su
// "xp" (il nome che podio/lista/sticky bar si aspettano).
function toBoardShape(rows, meId) {
  const withXp = rows.map((r) => ({ ...r, xp: r.xpThisMonth }));
  const me = withXp.find((r) => r.id === meId);
  return {
    top10: withXp.slice(0, 10),
    userResult: me
      ? { rank: me.rank, xp: me.xp, level: me.level, streakDays: me.streakDays }
      : { rank: null, xp: 0, level: xpToLevelInfo(0).title, streakDays: 0 },
  };
}

/* ============================================================================
   PERFORM — 08_ClassificaView.jsx
   Classifica Globale — Light Minimal Luxury, podio in metalli vivi animati,
   Archivio Storico Report (drawer a doppio livello). Standalone module,
   dati simulati locali.

   CORREZIONI CHIRURGICHE DI QUESTO GIRO (da confermare con Daniel):

   1. HEADER — il titolo NON usa più il gradiente animato Oro/Rosa: ora è
      colore pieno e fisso (#0F0F11 in Light, bianco in Onyx) proprio per
      evitare l'effetto sbiadito segnalato. Il gradiente vivo resta SOLO sui
      nomi del podio (metalli) e sui dati di riga/sticky bar.
   2. PODIO — rimossi completamente lo shimmer interno e il bagliore
      pulsante aggiunti nel giro precedente: erano la "luminescenza invadente"
      di cui ti sei lamentato. Restano solo bordo hairline metallico + entrata
      in dissolvenza.
   3. ARCHIVIO STORICO — il pulsante in fondo ora apre un drawer autonomo
      (mini-podio → deep-dive Top10). La board in cima alla pagina principale
      mostra SEMPRE il mese corrente; la navigazione storica vive solo nel
      drawer, per non avere due meccanismi di switch mese sovrapposti.

   Valori di brand riconfermati:
   - Onyx background: #09090B
   - Gradiente Oro (UOMO):   #D4AF37 → #F4E5A1 → #B8860B
   - Gradiente Rosa (DONNA): #E5C1CD → #F7DCE4 → #C98BA3
   ========================================================================= */

/* ---------- Dati simulati locali (preview) ---------- */

const AVATARS = {
  LupoAcciaio: 'https://i.pravatar.cc/150?img=11',
  FenicediFerro: 'https://i.pravatar.cc/150?img=12',
  TitanoRosso: 'https://i.pravatar.cc/150?img=13',
  AquilaNera: 'https://i.pravatar.cc/150?img=14',
  GuerrieroAlpha: 'https://i.pravatar.cc/150?img=15',
  TigreBronzo: 'https://i.pravatar.cc/150?img=16',
  FalcoRapido: 'https://i.pravatar.cc/150?img=17',
  OrsoPolare: 'https://i.pravatar.cc/150?img=18',
  ScorpioneBlu: 'https://i.pravatar.cc/150?img=19',
  LeoneSelvaggio: 'https://i.pravatar.cc/150?img=20',
};

const USER_AVATAR_URL = 'https://i.pravatar.cc/150?img=68'; // placeholder — in produzione: userAvatarUrl da Supabase Storage

function athlete(nickname, rank, xp, streakDays, level) {
  return { rank, nickname, avatarUrl: AVATARS[nickname], xp, streakDays, level };
}

const LEVELS = ['Recruit', 'Hardworker', 'Iron Mind', 'Bio-Hacker', 'Livello Élite'];

const MONTH_ARCHIVE = [
  {
    id: 'current',
    label: 'Mese Corrente',
    monthName: 'agosto',
    isCurrent: true,
    top10: [
      athlete('LupoAcciaio', 1, 2850, 21, 'Livello Élite'),
      athlete('FenicediFerro', 2, 2790, 18, 'Bio-Hacker'),
      athlete('TitanoRosso', 3, 2705, 15, 'Livello Élite'),
      athlete('AquilaNera', 4, 2610, 12, 'Iron Mind'),
      athlete('GuerrieroAlpha', 5, 2540, 19, 'Bio-Hacker'),
      athlete('TigreBronzo', 6, 2475, 9, 'Hardworker'),
      athlete('FalcoRapido', 7, 2390, 14, 'Iron Mind'),
      athlete('OrsoPolare', 8, 2310, 7, 'Hardworker'),
      athlete('ScorpioneBlu', 9, 2255, 11, 'Recruit'),
      athlete('LeoneSelvaggio', 10, 2190, 6, 'Iron Mind'),
    ],
    userResult: { rank: 14, xp: 1450, level: 'Hardworker', streakDays: 9 },
  },
  {
    id: 'luglio2026',
    label: 'Luglio 2026',
    monthName: 'luglio',
    isCurrent: false,
    top10: [
      athlete('TitanoRosso', 1, 2920, 30, 'Livello Élite'),
      athlete('LupoAcciaio', 2, 2880, 25, 'Livello Élite'),
      athlete('GuerrieroAlpha', 3, 2790, 22, 'Bio-Hacker'),
      athlete('FenicediFerro', 4, 2705, 20, 'Bio-Hacker'),
      athlete('AquilaNera', 5, 2640, 16, 'Iron Mind'),
      athlete('FalcoRapido', 6, 2560, 18, 'Iron Mind'),
      athlete('TigreBronzo', 7, 2480, 12, 'Hardworker'),
      athlete('LeoneSelvaggio', 8, 2400, 10, 'Iron Mind'),
      athlete('OrsoPolare', 9, 2320, 9, 'Hardworker'),
      athlete('ScorpioneBlu', 10, 2240, 13, 'Recruit'),
    ],
    userResult: { rank: 12, xp: 2100, level: 'Hardworker', streakDays: null },
  },
  {
    id: 'giugno2026',
    label: 'Giugno 2026',
    monthName: 'giugno',
    isCurrent: false,
    top10: [
      athlete('LupoAcciaio', 1, 2760, 19, 'Livello Élite'),
      athlete('TitanoRosso', 2, 2690, 17, 'Livello Élite'),
      athlete('FenicediFerro', 3, 2615, 14, 'Bio-Hacker'),
      athlete('GuerrieroAlpha', 4, 2540, 20, 'Bio-Hacker'),
      athlete('FalcoRapido', 5, 2470, 11, 'Iron Mind'),
      athlete('AquilaNera', 6, 2400, 9, 'Iron Mind'),
      athlete('OrsoPolare', 7, 2330, 6, 'Hardworker'),
      athlete('TigreBronzo', 8, 2260, 8, 'Hardworker'),
      athlete('LeoneSelvaggio', 9, 2190, 5, 'Iron Mind'),
      athlete('ScorpioneBlu', 10, 2120, 7, 'Recruit'),
    ],
    userResult: { rank: 16, xp: 1320, level: 'Recruit', streakDays: null },
  },
  {
    id: 'maggio2026',
    label: 'Maggio 2026',
    monthName: 'maggio',
    isCurrent: false,
    top10: [
      athlete('FenicediFerro', 1, 2680, 25, 'Bio-Hacker'),
      athlete('LupoAcciaio', 2, 2610, 22, 'Livello Élite'),
      athlete('AquilaNera', 3, 2540, 15, 'Iron Mind'),
      athlete('TitanoRosso', 4, 2470, 18, 'Livello Élite'),
      athlete('TigreBronzo', 5, 2400, 10, 'Hardworker'),
      athlete('GuerrieroAlpha', 6, 2330, 16, 'Bio-Hacker'),
      athlete('ScorpioneBlu', 7, 2260, 9, 'Recruit'),
      athlete('FalcoRapido', 8, 2190, 12, 'Iron Mind'),
      athlete('OrsoPolare', 9, 2120, 6, 'Hardworker'),
      athlete('LeoneSelvaggio', 10, 2050, 4, 'Iron Mind'),
    ],
    userResult: { rank: 19, xp: 980, level: 'Recruit', streakDays: null },
  },
];

const SIMULATED_GENDER = 'male'; // 'male' | 'female' — in produzione da Supabase userGender

/* ---------- Generatore mesi storici (per popolare lo scorrimento infinito) ----------
   L'app è nata a Settembre 2025: da lì in poi ogni mese storico viene generato con un
   PRNG deterministico (stesso seed → stessi dati ad ogni render), riusando il pool
   fisso di 10 atleti anonimizzati. In produzione questi dati arriverebbero
   dall'archivio server-side reale, paginato dal più recente al più vecchio. */

function mulberry32(seed) {
  return function rng() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWith(array, rng) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const ATHLETE_NICKNAMES = Object.keys(AVATARS);

function generateHistoricMonth(id, label, monthName, seed) {
  const rng = mulberry32(seed);
  const order = shuffleWith(ATHLETE_NICKNAMES, rng);
  const topXP = 2200 + Math.floor(rng() * 700);
  const top10 = order.map((nickname, idx) => {
    const xp = Math.max(900, topXP - idx * (35 + Math.floor(rng() * 45)));
    const streakDays = 3 + Math.floor(rng() * 27);
    const level = LEVELS[Math.min(LEVELS.length - 1, Math.floor(rng() * LEVELS.length))];
    return athlete(nickname, idx + 1, xp, streakDays, level);
  });
  const userRank = 10 + Math.floor(rng() * 16);
  const userXp = Math.max(350, top10[top10.length - 1].xp - 100 - Math.floor(rng() * 400));
  const userLevel = LEVELS[Math.floor(rng() * 3)];
  return { id, label, monthName, isCurrent: false, top10, userResult: { rank: userRank, xp: userXp, level: userLevel, streakDays: null } };
}

// Mesi generati proceduralmente, da Aprile 2026 a ritroso fino a Settembre 2025
// (mese di lancio dell'app — qui termina lo scorrimento infinito).
const GENERATED_HISTORY = [
  ['aprile2026', 'Aprile 2026', 'aprile', 401],
  ['marzo2026', 'Marzo 2026', 'marzo', 402],
  ['febbraio2026', 'Febbraio 2026', 'febbraio', 403],
  ['gennaio2026', 'Gennaio 2026', 'gennaio', 404],
  ['dicembre2025', 'Dicembre 2025', 'dicembre', 405],
  ['novembre2025', 'Novembre 2025', 'novembre', 406],
  ['ottobre2025', 'Ottobre 2025', 'ottobre', 407],
  ['settembre2025', 'Settembre 2025', 'settembre', 408],
].map(([id, label, monthName, seed]) => generateHistoricMonth(id, label, monthName, seed));

const APP_LAUNCH_LABEL = 'Settembre 2025';

/* ---------- Utility ---------- */

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = (e) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

function formatXP(n) {
  return n.toLocaleString('it-IT');
}

/* ---------- Icone (thin-line + 3D metalliche multistrato, NON emoji, NON stock icon-pack) ---------- */

function FlameIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M12 2.5c.9 2.7-1.6 3.9-1.6 6.4a1.9 1.9 0 1 0 3.8 0c0-1-.6-1.8-1-2.7 2 1 3.9 3 3.9 5.6a5.6 5.6 0 1 1-11.2 0c0-1.9.9-3.6 2.4-5.1-.1.9.4 1.7 1.2 1.9-.5-1.8.4-3.6 2.5-6.1z" />
    </svg>
  );
}

// Trofeo 3D: gradiente oro multistrato + micro-riflesso fisso + drop-shadow doppia
function TrophyIcon3D({ size = 34 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      style={{ filter: 'drop-shadow(0 10px 16px rgba(0,0,0,0.22)) drop-shadow(0 2px 4px rgba(0,0,0,0.16))' }}
    >
      <defs>
        <linearGradient id="pcTrophyGoldGrad" x1="10%" y1="0%" x2="90%" y2="100%">
          <stop offset="0%" stopColor="#FFFDD0" />
          <stop offset="38%" stopColor="#D4AF37" />
          <stop offset="72%" stopColor="#AA7C11" />
          <stop offset="100%" stopColor="#D4AF37" />
        </linearGradient>
      </defs>
      <path d="M15 6h18a2 2 0 0 1 2 2c0 7-4.6 12.4-11 13.4v4.6h4.5a1.5 1.5 0 0 1 1.5 1.5V30H17v-2.5a1.5 1.5 0 0 1 1.5-1.5H23v-4.6C16.6 20.4 12 15 12 8a2 2 0 0 1 2-2z" fill="url(#pcTrophyGoldGrad)" />
      <path d="M15 8c-2.6.4-4 2-4 4.4 0 3 2 5.6 5 6.6" fill="none" stroke="url(#pcTrophyGoldGrad)" strokeWidth="2" strokeLinecap="round" />
      <path d="M33 8c2.6.4 4 2 4 4.4 0 3-2 5.6-5 6.6" fill="none" stroke="url(#pcTrophyGoldGrad)" strokeWidth="2" strokeLinecap="round" />
      <rect x="14" y="32" width="20" height="3.4" rx="1.7" fill="url(#pcTrophyGoldGrad)" />
      <path d="M19 9.5c-.6 4 .4 8 3 10.4" stroke="rgba(255,255,255,0.75)" strokeWidth="1.3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

// Medaglia 3D (argento/bronzo): stesso trattamento multistrato, stella interna, nastro
function MedalIcon3D({ size = 34, variant = 'silver' }) {
  const stops =
    variant === 'silver'
      ? [
          ['0%', '#FFFFFF'],
          ['40%', '#C0C0C0'],
          ['75%', '#808080'],
          ['100%', '#C0C0C0'],
        ]
      : [
          ['0%', '#E6C2A5'],
          ['40%', '#CD7F32'],
          ['75%', '#8B5A2B'],
          ['100%', '#CD7F32'],
        ];
  const gradId = variant === 'silver' ? 'pcMedalSilverGrad' : 'pcMedalBronzeGrad';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      style={{ filter: 'drop-shadow(0 10px 16px rgba(0,0,0,0.2)) drop-shadow(0 2px 4px rgba(0,0,0,0.14))' }}
    >
      <defs>
        <linearGradient id={gradId} x1="10%" y1="0%" x2="90%" y2="100%">
          {stops.map(([offset, color]) => (
            <stop key={offset} offset={offset} stopColor={color} />
          ))}
        </linearGradient>
      </defs>
      <path d="M17 5l4 9M31 5l-4 9" stroke={`url(#${gradId})`} strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="24" cy="27" r="12.5" fill={`url(#${gradId})`} />
      <circle cx="24" cy="27" r="12.5" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
      <path d="M24 20.5l2 4.2 4.6.6-3.4 3.2.8 4.5-4-2.2-4 2.2.8-4.5-3.4-3.2 4.6-.6z" fill="rgba(255,255,255,0.55)" />
      <path d="M18 20c-1 2-1 5 0 7.4" stroke="rgba(255,255,255,0.6)" strokeWidth="1.1" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function PersonSilhouetteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ width: '58%', height: '58%', opacity: 0.4 }}>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

/* ---------- Sotto-componenti (hoisted a livello modulo) ---------- */

function AvatarCircle({ avatarUrl, className = '' }) {
  const [errored, setErrored] = useState(false);
  const showImage = avatarUrl && !errored;
  return (
    <div className={`pc-avatar ${className}`}>
      {showImage ? <img src={avatarUrl} alt="" className="pc-avatar-img" onError={() => setErrored(true)} /> : <PersonSilhouetteIcon />}
    </div>
  );
}

const METAL_FOR_RANK = { 1: 'gold', 2: 'silver', 3: 'bronze' };

function PodiumCard({ athlete: a, position, delay, onSelect }) {
  const heightClass = position === 'center' ? 'pc-podium-tall' : position === 'left' ? 'pc-podium-mid' : 'pc-podium-low';
  const metal = METAL_FOR_RANK[a.rank];

  return (
    <div className={`pc-podium-card pc-metal-${metal} ${heightClass}`} style={{ animationDelay: `${delay}ms`, cursor: onSelect ? 'pointer' : undefined }}
         onClick={onSelect ? () => onSelect(a) : undefined} role={onSelect ? 'button' : undefined} tabIndex={onSelect ? 0 : undefined}>
      <div className="pc-medal-float">
        {a.rank === 1 ? <TrophyIcon3D size={38} /> : <MedalIcon3D size={34} variant={metal} />}
      </div>
      <AvatarCircle avatarUrl={a.avatarUrl} className="pc-avatar-podium" />
      <div className={`pc-podium-nick pc-nick-metal pc-nick-${metal}`}>{a.nickname}</div>
      <div className="pc-level-badge pc-shine-text">{a.level}</div>
      <div className="pc-podium-xp pc-shine-text">
        {formatXP(a.xp)} <span className="pc-xp-unit">XP</span>
      </div>
      <div className="pc-inline-flame pc-podium-streak">
        <FlameIcon size={12} />
        <span className="pc-shine-text">{a.streakDays} Giorni</span>
      </div>
    </div>
  );
}

function LeaderboardRow({ athlete: a, maxXP, onSelect }) {
  const barWidth = Math.max(8, Math.round((a.xp / maxXP) * 100));
  return (
    <div className="pc-row" style={{ cursor: onSelect ? 'pointer' : undefined }}
         onClick={onSelect ? () => onSelect(a) : undefined} role={onSelect ? 'button' : undefined} tabIndex={onSelect ? 0 : undefined}>
      <div className="pc-row-rank">{a.rank}°</div>
      <AvatarCircle avatarUrl={a.avatarUrl} className="pc-avatar-row" />
      <div className="pc-row-main">
        <div className="pc-row-top">
          <span className="pc-row-nick">{a.nickname}</span>
          <span className="pc-level-badge pc-level-badge-sm pc-shine-text">{a.level}</span>
        </div>
        <div className="pc-row-track">
          <div className="pc-row-fill" style={{ width: `${barWidth}%` }} />
        </div>
        <div className="pc-row-bottom">
          <span className="pc-row-xp pc-shine-text">
            {formatXP(a.xp)} <span className="pc-xp-unit">XP</span>
          </span>
          <span className="pc-inline-flame pc-row-streak">
            <FlameIcon size={11} />
            <span className="pc-shine-text">{a.streakDays} Giorni</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/* Dettaglio atleta: livello, bio, XP totali LIFETIME (non il guadagno del
   mese mostrato in classifica) e giorni massimi di streak — click su una
   riga/podio qualsiasi, sia nel mese corrente sia nell'archivio storico
   (stessa forma dati, stesso componente). Centrato sullo schermo come gli
   altri popup dell'app, mai in basso. */
function AthleteDetailModal({ athlete: a, onClose }) {
  if (!a) return null;
  return (
    <Portal>
      <div className="pc-detail-overlay" onClick={onClose}>
        <div className="pc-detail-modal" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="pc-drawer-close pc-detail-close" onClick={onClose} aria-label="Chiudi">✕</button>
          <AvatarCircle avatarUrl={a.avatarUrl} className="pc-avatar-detail" />
          <div className="pc-detail-nick">{a.nickname}</div>
          <div className="pc-level-badge pc-shine-text" style={{ marginTop: 4 }}>{a.level}</div>
          {a.bio && <p className="pc-detail-bio">{a.bio}</p>}
          <div className="pc-detail-stats">
            <div className="pc-detail-stat">
              <div className="pc-detail-stat-value pc-shine-text">{formatXP(a.xpTotal ?? a.xp)}</div>
              <div className="pc-detail-stat-label">XP totali</div>
            </div>
            <div className="pc-detail-stat">
              <div className="pc-detail-stat-value pc-shine-text">{a.longestStreak ?? a.streakDays}</div>
              <div className="pc-detail-stat-label">Streak massimo</div>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}

function StickyUserBar({ isCurrent, rank, xp, gapToTop10, avatarUrl, level, streakDays }) {
  const inTop10 = rank <= 10;
  return (
    <div className="pc-sticky">
      <div className="pc-sticky-inner">
        <div className="pc-sticky-rank">
          <span className="pc-sticky-rank-num pc-shine-text">{rank}°</span>
          <span className="pc-field-label pc-sticky-rank-label">Posizione</span>
        </div>
        <div className="pc-sticky-divider" />
        <div className="pc-sticky-info">
          {isCurrent ? (
            <>
              <div className="pc-sticky-title">
                Tu sei al <strong>{rank}° Posto</strong> · <span className="pc-shine-text">{formatXP(xp)} XP</span>
                {' · '}
                <span className="pc-inline-flame pc-sticky-streak-inline">
                  <FlameIcon size={12} />
                  <span className="pc-shine-text">{streakDays} Giorni</span>
                </span>
              </div>
              <div className="pc-sticky-sub">
                <span className="pc-shine-text pc-sticky-level">{level}</span>
                {' · '}
                {inTop10
                  ? 'Sei già in Top 10 — non spezzare la catena, difendi la posizione!'
                  : `Ti mancano ${formatXP(gapToTop10)} XP per la Top 10 — non spezzare la catena o perdi il moltiplicatore XP!`}
              </div>
            </>
          ) : (
            <>
              <div className="pc-sticky-title">
                In questo mese hai chiuso al <strong>{rank}° Posto</strong> · <span className="pc-shine-text">{formatXP(xp)} XP</span>
              </div>
              <div className="pc-sticky-sub">
                <span className="pc-shine-text pc-sticky-level">{level}</span>
                {' · '}Risultato storico immutabile
              </div>
            </>
          )}
        </div>
        <AvatarCircle avatarUrl={avatarUrl} className="pc-avatar-sticky" />
      </div>
    </div>
  );
}

// Mini-podio compatto per una riga dell'Archivio (Livello 1), espandibile in
// Deep-Dive Top10 (Livello 2) con micro-tasto di chiusura filiforme.
function ArchiveMonthRow({ month, expanded, onToggle, onSelectAthlete }) {
  const top3 = month.top10.filter((a) => a.rank <= 3).sort((a, b) => a.rank - b.rank);
  const maxXP = month.top10[0].xp;
  return (
    <div className={`pc-archive-month ${expanded ? 'pc-archive-month-expanded' : ''}`}>
      <button type="button" className="pc-archive-month-header" onClick={() => onToggle(month.id)}>
        <span>{month.label}</span>
        <span className="pc-archive-chevron">{expanded ? '−' : '+'}</span>
      </button>

      <div className="pc-mini-podium">
        {top3.map((a) => {
          const metal = METAL_FOR_RANK[a.rank];
          return (
            <div key={a.rank} className="pc-mini-podium-item">
              <div className="pc-mini-medal">
                {a.rank === 1 ? <TrophyIcon3D size={20} /> : <MedalIcon3D size={18} variant={metal} />}
              </div>
              <AvatarCircle avatarUrl={a.avatarUrl} className="pc-avatar-mini" />
              <div className={`pc-mini-nick pc-nick-metal pc-nick-${metal}`}>{a.nickname}</div>
            </div>
          );
        })}
      </div>

      {expanded && (
        <div className="pc-archive-detail">
          <button type="button" className="pc-archive-close-mini" onClick={() => onToggle(month.id)} aria-label="Chiudi dettaglio mese">
            ✕
          </button>
          <div className="pc-list pc-list-archive">
            {month.top10.map((a) => (
              <LeaderboardRow key={a.rank} athlete={a} maxXP={maxXP} onSelect={onSelectAthlete} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ArchiveDrawer({ open, onClose, months, expandedId, onToggleExpand, loading, empty, showLaunchLabel = true, onSelectAthlete }) {
  const [visibleCount, setVisibleCount] = useState(4);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (open) {
      setVisibleCount(4);
      setLoadingMore(false);
    }
  }, [open]);

  if (!open) return null;

  const visibleMonths = months.slice(0, visibleCount);
  const hasMore = visibleCount < months.length;

  const handleScroll = (e) => {
    if (loadingMore || !hasMore) return;
    const el = e.currentTarget;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 120;
    if (nearBottom) {
      setLoadingMore(true);
      // Simula la latenza di una chiamata all'archivio server-side paginato
      window.setTimeout(() => {
        setVisibleCount((c) => Math.min(months.length, c + 4));
        setLoadingMore(false);
      }, 350);
    }
  };

  return (
    <div className="pc-drawer-overlay" onClick={onClose}>
      <div className="pc-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="pc-drawer-header">
          <span className="pc-drawer-title">Archivio Storico</span>
          <button type="button" className="pc-drawer-close" onClick={onClose} aria-label="Chiudi archivio">
            ✕
          </button>
        </div>
        <div className="pc-drawer-body" onScroll={handleScroll}>
          {loading && <div className="pc-drawer-loading">Caricamento archivio…</div>}
          {empty && <div className="pc-drawer-end">Ancora nessun mese chiuso da consultare — torna qui dal mese prossimo.</div>}
          {visibleMonths.map((m) => (
            <ArchiveMonthRow key={m.id} month={m} expanded={expandedId === m.id} onToggle={onToggleExpand} onSelectAthlete={onSelectAthlete} />
          ))}
          {loadingMore && <div className="pc-drawer-loading">Caricamento mesi precedenti…</div>}
          {!loading && !hasMore && visibleMonths.length > 0 && showLaunchLabel && (
            <div className="pc-drawer-end">📍 {APP_LAUNCH_LABEL} — primo mese di PERFORM, archivio completo</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Componente principale ---------- */

export default function ClassificaView({ supabase, meId, genderOverride, dark = true } = {}) {
  // mode e gender seguono lo stato REALE dell'app (dark/genderOverride, da
  // App.jsx) — prima erano un toggle locale scollegato ("Onyx/Light",
  // "Oro/Rosa" in alto a destra) rimasto in produzione per errore, lo stesso
  // bug del pannello coach che restava bianco fuori posto.
  const gender = genderOverride === 'female' ? 'female' : SIMULATED_GENDER;
  const mode = dark ? 'onyx' : 'light';
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedAthlete, setSelectedAthlete] = useState(null);
  const [expandedMonthId, setExpandedMonthId] = useState(null);
  const reducedMotion = usePrefersReducedMotion();

  // Classifica globale reale: XP guadagnato NEL MESE (non più il totale
  // lifetime), da fetchMonthlyLeaderboard — diff fra due snapshot mensili
  // scritti dalla Edge Function monthly-xp-snapshot (cron il 1° di ogni
  // mese, SCHEMA_v27). Se il cron non è mai girato per un mese, quel mese
  // torna null e non è consultabile — mai un mese storico inventato.
  const isRealMode = Boolean(supabase && meId);
  const currentMonthKey = useMemo(() => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit' }).format(new Date()).replace('/', '-'), []);
  const [realBoard, setRealBoard] = useState(null); // null = non ancora caricato
  useEffect(() => {
    if (!isRealMode) return undefined;
    let cancelled = false;
    fetchMonthlyLeaderboard(supabase, currentMonthKey)
      .then((rows) => {
        if (cancelled) return;
        const { monthName } = monthKeyLabel(currentMonthKey);
        setRealBoard({ monthName, isCurrent: true, ...toBoardShape(rows ?? [], meId) });
      })
      .catch((err) => {
        console.error('PERFORM: errore caricamento classifica reale', err);
        if (!cancelled) setRealBoard({ monthName: '', isCurrent: true, top10: [], userResult: { rank: null, xp: 0, level: 'RECRUIT', streakDays: 0 } });
      });
    return () => { cancelled = true; };
  }, [isRealMode, supabase, meId, currentMonthKey]);

  // Archivio Storico reale: caricato SOLO all'apertura del drawer (non alla
  // board principale), risalendo un mese alla volta finché
  // fetchMonthlyLeaderboard non torna null (il cron non era ancora attivo
  // quel mese, o l'app non esisteva) — cresce da solo un mese in più ogni
  // volta che passa un mese reale, mai una lista fissa.
  const [realPastMonths, setRealPastMonths] = useState(null); // null = non ancora caricato
  const [archiveLoading, setArchiveLoading] = useState(false);
  const loadRealArchive = async () => {
    if (!isRealMode || realPastMonths !== null || archiveLoading) return;
    setArchiveLoading(true);
    const months = [];
    let cursor = shiftMonthKey(currentMonthKey, -1);
    for (let i = 0; i < 11; i++) { // fino a 11 mesi indietro, si ferma prima se un mese torna null
      try {
        const rows = await fetchMonthlyLeaderboard(supabase, cursor);
        if (!rows) break;
        const { label, monthName } = monthKeyLabel(cursor);
        months.push({ id: cursor, label, monthName, isCurrent: false, ...toBoardShape(rows, meId) });
      } catch (err) {
        console.error('PERFORM: errore caricamento archivio classifica', cursor, err);
        break;
      }
      cursor = shiftMonthKey(cursor, -1);
    }
    setRealPastMonths(months);
    setArchiveLoading(false);
  };

  // La board principale mostra SEMPRE il mese corrente. Lo storico si
  // consulta esclusivamente nel drawer "Archivio Storico Report".
  const demoCurrentMonth = useMemo(() => MONTH_ARCHIVE.find((m) => m.isCurrent), []);
  const demoPastMonths = useMemo(() => [...MONTH_ARCHIVE.filter((m) => !m.isCurrent), ...GENERATED_HISTORY], []);
  const pastMonths = isRealMode ? (realPastMonths ?? []) : demoPastMonths;

  // Placeholder neutro finché i dati reali non sono arrivati: MAI un return
  // anticipato prima degli hook qui sotto (useMemo incluso) — un return che
  // salta un hook al primo render e lo esegue al secondo è esattamente la
  // causa della pagina bianca: React vede un numero di hook diverso tra un
  // render e l'altro e va in crash. Il "Caricamento…" resta quindi solo
  // nella JSX finale, mai come return anticipato della funzione.
  const isLoadingRealBoard = isRealMode && realBoard === null;
  const currentMonth = isRealMode
    ? (realBoard ?? { top10: [], userResult: { rank: null, xp: 0, level: 'RECRUIT', streakDays: 0 }, isCurrent: true, monthName: '' })
    : demoCurrentMonth;
  // Il podio si aspetta SEMPRE almeno i rank 1/2/3: se ci sono meno di 3
  // atleti reali (community appena nata, o dati non ancora caricati),
  // riempiamo gli slot mancanti con placeholder neutri invece di far
  // crashare PodiumCard su un rank assente.
  const top10 = [1, 2, 3].every((r) => currentMonth.top10.some((a) => a.rank === r))
    ? currentMonth.top10
    : [
        ...currentMonth.top10,
        ...[1, 2, 3]
          .filter((r) => !currentMonth.top10.some((a) => a.rank === r))
          .map((r) => ({ rank: r, nickname: '—', avatarUrl: null, xp: 0, streakDays: 0, level: 'RECRUIT' })),
      ];
  const maxXP = top10[0].xp;
  const tenthPlaceXP = top10[top10.length - 1].xp;
  const gapToTop10 = Math.max(0, tenthPlaceXP - currentMonth.userResult.xp + 1);

  const podiumOrder = useMemo(() => {
    const first = top10.find((a) => a.rank === 1);
    const second = top10.find((a) => a.rank === 2);
    const third = top10.find((a) => a.rank === 3);
    return [
      { athlete: second, position: 'left', delay: 100 },
      { athlete: first, position: 'center', delay: 0 },
      { athlete: third, position: 'right', delay: 200 },
    ];
  }, [top10]);

  const restOfList = top10.filter((a) => a.rank > 3);

  const handleToggleExpand = (id) => setExpandedMonthId((cur) => (cur === id ? null : id));

  if (isLoadingRealBoard) {
    return (
      <div className={`pc-root pc-theme-${gender} pc-mode-${mode}`} style={{ minHeight: '40vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--pc-text-secondary, #888)' }}>
        Caricamento classifica…
      </div>
    );
  }

  return (
    <div className={`pc-root pc-theme-${gender} pc-mode-${mode}`}>
      <style>{`
        .pc-root {
          --pc-sans: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          --pc-blur: 16px;
        }

        .pc-mode-onyx {
          --pc-bg: #09090B;
          --pc-glass-bg: rgba(24, 24, 27, 0.4);
          --pc-glass-border: rgba(63, 63, 70, 0.3);
          --pc-track-bg: rgba(255, 255, 255, 0.05);
          --pc-text-primary: #F4F4F5;
          --pc-text-secondary: rgba(244, 244, 245, 0.55);
          --pc-text-tertiary: rgba(244, 244, 245, 0.38);
          --pc-sticky-fade: linear-gradient(180deg, rgba(9,9,11,0) 0%, rgba(9,9,11,0.82) 25%, rgba(9,9,11,0.96) 100%);
          --pc-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }

        .pc-mode-light {
          --pc-bg: #FAFAF9;
          --pc-glass-bg: rgba(255, 255, 255, 0.4);
          --pc-glass-border: rgba(228, 228, 231, 0.55);
          --pc-track-bg: rgba(24, 24, 27, 0.06);
          --pc-text-primary: #18181B;
          --pc-text-secondary: rgba(24, 24, 27, 0.55);
          --pc-text-tertiary: rgba(24, 24, 27, 0.4);
          --pc-sticky-fade: linear-gradient(180deg, rgba(250,250,249,0) 0%, rgba(250,250,249,0.85) 25%, rgba(250,250,249,0.98) 100%);
          --pc-shadow: 0 8px 32px rgba(24, 24, 27, 0.08);
          /* Correzione contrasti Light Mode — vedi sezione dedicata più sotto */
          --pc-num-strong: #18181B;    /* zinc-900 — numeri di posizione, scritte piccole */
          --pc-num-value: #3F3F46;     /* zinc-700 — valori XP e giorni di streak nella lista */
          --pc-sticky-strong: #09090B; /* zinc-950 — testo principale sticky bar */
          --pc-sticky-muted: #52525B;  /* zinc-600 — avviso/promemoria sticky bar */
        }

        .pc-theme-male { --pc-accent-1: #D4AF37; --pc-accent-2: #F4E5A1; --pc-accent-3: #B8860B; --pc-accent-glow: rgba(212, 175, 55, 0.24); }
        .pc-theme-female { --pc-accent-1: #E5C1CD; --pc-accent-2: #F7DCE4; --pc-accent-3: #C98BA3; --pc-accent-glow: rgba(229, 193, 205, 0.24); }
        .pc-mode-light.pc-theme-male { --pc-accent-glow: rgba(212, 175, 55, 0.12); }
        .pc-mode-light.pc-theme-female { --pc-accent-glow: rgba(229, 193, 205, 0.14); }

        .pc-root, .pc-root * { font-family: var(--pc-sans) !important; box-sizing: border-box; }

        .pc-root {
          background: var(--pc-bg);
          color: var(--pc-text-primary);
          min-height: 100vh;
          padding: 18px 18px 152px;
          position: relative;
          overflow-x: hidden;
          transition: background-color 0.25s ease, color 0.25s ease;
        }

        .pc-shine-text {
          background: linear-gradient(90deg, var(--pc-accent-1), var(--pc-accent-2), var(--pc-accent-3), var(--pc-accent-1));
          background-size: 280% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: pc-flow 4.5s linear infinite;
        }

        @keyframes pc-flow { 0% { background-position: 0% 50%; } 100% { background-position: 280% 50%; } }
        @keyframes pc-flow-bar { 0% { background-position: 220% 50%; } 100% { background-position: 0% 50%; } }

        /* Metalli vivi animati per i NOMI del podio (fissi, indipendenti dal genere) */
        .pc-nick-metal {
          background-size: 260% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: pc-flow 4.2s linear infinite;
        }
        .pc-nick-gold { background-image: linear-gradient(90deg, #D4AF37, #FFFDD0, #AA7C11, #D4AF37); }
        .pc-nick-silver { background-image: linear-gradient(90deg, #C0C0C0, #FFFFFF, #808080, #C0C0C0); }
        .pc-nick-bronze { background-image: linear-gradient(90deg, #CD7F32, #E6C2A5, #8B5A2B, #CD7F32); }

        .pc-field-label { font-size: 10px; font-weight: 300; letter-spacing: 0.15em; text-transform: uppercase; color: var(--pc-text-tertiary); }

        .pc-inline-flame { display: inline-flex; align-items: center; gap: 4px; vertical-align: middle; color: var(--pc-accent-1); }

        .pc-avatar {
          display: flex; align-items: center; justify-content: center; border-radius: 50%;
          background: var(--pc-glass-bg); border: 0.5px solid var(--pc-glass-border);
          color: var(--pc-text-tertiary); overflow: hidden; flex-shrink: 0;
        }
        .pc-avatar-img { width: 100%; height: 100%; object-fit: cover; display: block; }

        /* ---------- Header istituzionale — centrato, colori pieni ---------- */

        .pc-toggles-float {
          position: absolute;
          top: 16px;
          right: 18px;
          z-index: 2;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 6px;
        }

        .pc-header-center {
          position: relative;
          z-index: 1;
          text-align: center;
          margin: 10px auto 34px;
          padding: 0 76px;
        }

        .pc-title-line1 {
          font-size: 24px;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          background: linear-gradient(90deg, var(--pc-accent-1), var(--pc-accent-2), var(--pc-accent-3), var(--pc-accent-1));
          background-size: 300% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: pc-flow 6s linear infinite;
        }

        .pc-title-line2 {
          margin-top: 8px;
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.01em;
          color: var(--pc-text-primary);
        }

        .pc-pill-toggle {
          font-size: 10.5px;
          font-weight: 300;
          letter-spacing: -0.005em;
          color: var(--pc-text-secondary);
          background: var(--pc-glass-bg);
          backdrop-filter: blur(var(--pc-blur));
          -webkit-backdrop-filter: blur(var(--pc-blur));
          border: 0.5px solid var(--pc-glass-border);
          border-radius: 999px;
          padding: 6px 12px;
          cursor: pointer;
          display: flex;
          gap: 5px;
          align-items: center;
        }
        .pc-pill-sep { opacity: 0.25; }
        .pc-pill-active { color: var(--pc-accent-1); font-weight: 600; }

        /* ---------- Podio — vetro etereo, zero luminescenze, solo bordo metallico ---------- */

        .pc-podium { position: relative; z-index: 1; display: flex; align-items: flex-end; justify-content: center; gap: 16px; margin-bottom: 44px; }

        .pc-podium-card {
          flex: 1;
          max-width: 156px;
          display: flex;
          flex-direction: column;
          align-items: center;
          background: var(--pc-glass-bg);
          backdrop-filter: blur(var(--pc-blur));
          -webkit-backdrop-filter: blur(var(--pc-blur));
          border: 1px solid var(--pc-glass-border);
          border-radius: 26px;
          padding: 22px 14px 20px;
          text-align: center;
          position: relative;
          overflow: visible;
          opacity: 0;
          transform: translateY(14px);
          animation: pc-podium-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        /* In Light Mode: vetro quasi del tutto trasparente, come richiesto */
        .pc-mode-light .pc-podium-card {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
        }

        @keyframes pc-podium-in { to { opacity: 1; transform: translateY(0); } }

        .pc-podium-tall { padding-top: 28px; padding-bottom: 26px; }
        .pc-podium-mid { padding-top: 19px; padding-bottom: 18px; margin-bottom: 6px; }
        .pc-podium-low { padding-top: 15px; padding-bottom: 14px; margin-bottom: 18px; }

        /* Micro-bordo perimetrale nitido, nessun glow/pulsazione */
        .pc-metal-gold { border-color: rgba(212, 175, 55, 0.85); }
        .pc-metal-silver { border-color: rgba(192, 192, 192, 0.85); }
        .pc-metal-bronze { border-color: rgba(205, 127, 50, 0.85); }
        .pc-mode-light .pc-metal-silver { border-color: rgba(148, 163, 184, 0.85); }

        /* Icona/medaglia che "fluttua" sopra il bordo superiore della card */
        .pc-medal-float {
          margin-top: -30px;
          margin-bottom: 12px;
          display: flex;
          justify-content: center;
          position: relative;
          z-index: 2;
        }

        .pc-avatar-podium { width: 54px; height: 54px; margin-bottom: 14px; }

        .pc-podium-nick { font-size: 13.5px; font-weight: 700; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }

        .pc-level-badge { display: inline-flex; align-items: center; font-size: 10.5px; font-weight: 500; letter-spacing: -0.005em; white-space: nowrap; margin-top: 5px; }
        .pc-level-badge-sm { font-size: 9.5px; flex-shrink: 0; margin-top: 0; }

        .pc-podium-xp { font-size: 16px; font-weight: 300; letter-spacing: -0.01em; margin-top: 10px; }
        .pc-xp-unit { font-size: 10px; font-weight: 300; color: var(--pc-text-tertiary); -webkit-text-fill-color: var(--pc-text-tertiary); }
        .pc-podium-streak { font-size: 11px; font-weight: 300; letter-spacing: -0.01em; margin-top: 8px; justify-content: center; }

        /* ---------- Lista 4°-10° — semplice, alto contrasto, minimalista ---------- */

        .pc-list { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 14px; max-width: 560px; margin: 0 auto; }

        .pc-row {
          display: flex; align-items: center; gap: 14px;
          background: var(--pc-glass-bg);
          backdrop-filter: blur(var(--pc-blur));
          -webkit-backdrop-filter: blur(var(--pc-blur));
          border: 0.5px solid var(--pc-glass-border);
          border-radius: 20px;
          padding: 16px 18px;
        }

        .pc-row-rank { font-size: 13px; font-weight: 300; letter-spacing: -0.01em; color: var(--pc-text-tertiary); width: 24px; text-align: center; flex-shrink: 0; }
        .pc-avatar-row { width: 36px; height: 36px; }
        .pc-row-main { flex: 1; min-width: 0; }
        .pc-row-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; gap: 8px; }
        .pc-row-nick { font-size: 14px; font-weight: 600; letter-spacing: -0.01em; color: var(--pc-text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .pc-row-xp { font-size: 13px; font-weight: 300; letter-spacing: -0.01em; flex-shrink: 0; }
        .pc-row-track { height: 3px; background: var(--pc-track-bg); border-radius: 999px; overflow: hidden; }
        .pc-row-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--pc-accent-3), var(--pc-accent-1), var(--pc-accent-2)); background-size: 220% 100%; animation: pc-flow-bar 4.5s linear infinite; }
        .pc-row-bottom { display: flex; justify-content: space-between; align-items: baseline; margin-top: 8px; gap: 8px; }
        .pc-row-streak { font-size: 11px; font-weight: 300; letter-spacing: -0.01em; flex-shrink: 0; }

        /* ---------- Pulsante Archivio Storico Report ---------- */

        .pc-archive-btn {
          display: block;
          margin: 36px auto 6px;
          font-size: 12px;
          font-weight: 400;
          letter-spacing: -0.005em;
          color: var(--pc-text-secondary);
          background: var(--pc-glass-bg);
          backdrop-filter: blur(var(--pc-blur));
          -webkit-backdrop-filter: blur(var(--pc-blur));
          border: 0.5px solid var(--pc-glass-border);
          border-radius: 999px;
          padding: 11px 22px;
          cursor: pointer;
        }

        /* ---------- Drawer Archivio Storico ---------- */

        .pc-drawer-overlay {
          position: fixed; inset: 0; z-index: 40;
          background: rgba(0, 0, 0, 0.35);
          display: flex; align-items: flex-end; justify-content: center;
        }

        .pc-drawer {
          width: 100%; max-width: 560px; max-height: 78vh; display: flex; flex-direction: column;
          background: var(--pc-glass-bg);
          backdrop-filter: blur(var(--pc-blur));
          -webkit-backdrop-filter: blur(var(--pc-blur));
          border: 0.5px solid var(--pc-glass-border);
          border-bottom: none;
          border-top-left-radius: 28px;
          border-top-right-radius: 28px;
          padding: 18px 18px 0;
          animation: pc-drawer-up 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes pc-drawer-up { from { transform: translateY(100%); } to { transform: translateY(0); } }

        /* ---------- Dettaglio Atleta (centrato, non un bottom sheet) ---------- */

        .pc-detail-overlay {
          position: fixed; inset: 0; z-index: 50;
          background: rgba(0, 0, 0, 0.45);
          display: flex; align-items: center; justify-content: center;
          padding: 20px;
        }
        .pc-detail-modal {
          position: relative;
          width: 100%; max-width: 340px;
          display: flex; flex-direction: column; align-items: center;
          text-align: center;
          background: var(--pc-glass-bg);
          backdrop-filter: blur(var(--pc-blur));
          -webkit-backdrop-filter: blur(var(--pc-blur));
          border: 0.5px solid var(--pc-glass-border);
          border-radius: 28px;
          padding: 32px 22px 24px;
          animation: pc-drawer-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .pc-detail-close { position: absolute; top: 14px; right: 14px; }
        .pc-avatar-detail { width: 76px; height: 76px; margin-bottom: 14px; }
        .pc-detail-nick { font-size: 17px; font-weight: 600; color: var(--pc-text-primary); }
        .pc-detail-bio { font-size: 12.5px; color: var(--pc-text-secondary); line-height: 1.5; margin: 12px 0 0; }
        .pc-detail-stats { display: flex; gap: 28px; margin-top: 20px; }
        .pc-detail-stat { display: flex; flex-direction: column; align-items: center; gap: 3px; }
        .pc-detail-stat-value { font-size: 19px; font-weight: 700; }
        .pc-detail-stat-label { font-size: 10px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--pc-text-tertiary); }

        .pc-drawer-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
        .pc-drawer-title { font-size: 12.5px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--pc-text-primary); }
        .pc-drawer-close {
          width: 26px; height: 26px; border-radius: 50%;
          border: 0.5px solid var(--pc-glass-border);
          background: var(--pc-glass-bg);
          color: var(--pc-text-secondary);
          font-size: 11px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
        }

        .pc-drawer-body {
          display: flex;
          flex-direction: column;
          gap: 12px;
          overflow-y: auto;
          flex: 1;
          padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px));
          scrollbar-width: thin;
        }

        .pc-drawer-loading, .pc-drawer-end {
          text-align: center;
          font-size: 11px;
          font-weight: 300;
          letter-spacing: 0.02em;
          color: var(--pc-text-tertiary);
          padding: 10px 0 4px;
        }

        .pc-archive-month {
          background: var(--pc-glass-bg);
          border: 0.5px solid var(--pc-glass-border);
          border-radius: 20px;
          padding: 14px 16px;
        }

        .pc-archive-month-header {
          width: 100%;
          display: flex; justify-content: space-between; align-items: center;
          background: none; border: none; padding: 0; cursor: pointer;
          color: var(--pc-text-primary);
          font-size: 12.5px; font-weight: 500; letter-spacing: -0.005em;
          margin-bottom: 12px;
        }
        .pc-archive-chevron { font-weight: 300; color: var(--pc-text-tertiary); font-size: 15px; }

        .pc-mini-podium { display: flex; justify-content: center; gap: 16px; }
        .pc-mini-podium-item { display: flex; flex-direction: column; align-items: center; gap: 5px; }
        .pc-mini-medal { display: flex; justify-content: center; }
        .pc-avatar-mini { width: 30px; height: 30px; }
        .pc-mini-nick { font-size: 10px; font-weight: 700; letter-spacing: -0.005em; max-width: 64px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        .pc-archive-detail { position: relative; margin-top: 16px; padding-top: 16px; border-top: 0.5px solid var(--pc-glass-border); }
        .pc-archive-close-mini {
          position: absolute; top: -8px; right: 0;
          width: 22px; height: 22px; border-radius: 50%;
          border: 0.5px solid var(--pc-glass-border);
          background: var(--pc-glass-bg);
          color: var(--pc-text-tertiary);
          font-size: 10px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
        }
        .pc-list-archive { gap: 10px; max-width: none; }

        /* ---------- Sticky bar ---------- */

        .pc-sticky { position: fixed; left: 0; right: 0; bottom: 0; z-index: 20; padding: 14px 18px calc(14px + env(safe-area-inset-bottom, 0px)); background: var(--pc-sticky-fade); }

        .pc-sticky-inner {
          max-width: 560px; margin: 0 auto; display: flex; align-items: center; gap: 16px;
          background: var(--pc-glass-bg);
          backdrop-filter: blur(var(--pc-blur));
          -webkit-backdrop-filter: blur(var(--pc-blur));
          border: 0.5px solid var(--pc-glass-border);
          border-radius: 24px;
          padding: 14px 20px;
          box-shadow: var(--pc-shadow);
        }

        .pc-sticky-rank { display: flex; flex-direction: column; align-items: center; line-height: 1.15; flex-shrink: 0; }
        .pc-sticky-rank-num { font-size: 22px; font-weight: 300; letter-spacing: -0.02em; }
        .pc-sticky-rank-label { margin-top: 2px; }
        .pc-sticky-divider { width: 0.5px; align-self: stretch; background: var(--pc-glass-border); }
        .pc-sticky-info { min-width: 0; }
        .pc-sticky-title { font-size: 13.5px; font-weight: 400; letter-spacing: -0.01em; color: var(--pc-text-primary); }
        .pc-sticky-title strong { color: var(--pc-accent-1); font-weight: 600; }
        .pc-sticky-streak-inline { font-weight: 300; font-size: 13px; letter-spacing: -0.01em; }
        .pc-sticky-sub { font-size: 11.5px; font-weight: 300; letter-spacing: -0.005em; color: var(--pc-text-secondary); margin-top: 4px; }
        .pc-sticky-level { font-weight: 500; }
        .pc-avatar-sticky { width: 38px; height: 38px; }

        /* ==================== CORREZIONE CONTRASTI — SOLO LIGHT MODE ====================
           Onyx Mode non viene toccato. Qui si sistema la leggibilità in Light: i grigi
           chiari e i gradienti pallidi (oro chiaro su sfondo bianco) diventano solidi
           e scuri, sia nella Lista (righe 4°-10°) sia nella Sticky Bar. Il podio e il
           titolo restano invariati (non segnalati come illeggibili). */

        .pc-mode-light .pc-row-rank { color: var(--pc-num-strong); }

        .pc-mode-light .pc-row-xp,
        .pc-mode-light .pc-row-xp .pc-xp-unit,
        .pc-mode-light .pc-row-streak .pc-shine-text {
          background: none;
          animation: none;
          -webkit-text-fill-color: var(--pc-num-value);
          color: var(--pc-num-value);
        }

        .pc-mode-light .pc-sticky-rank-num {
          background: none;
          animation: none;
          -webkit-text-fill-color: var(--pc-sticky-strong);
          color: var(--pc-sticky-strong);
        }
        .pc-mode-light .pc-sticky-rank-label { color: var(--pc-num-strong); }

        .pc-mode-light .pc-sticky-title { color: var(--pc-sticky-strong); }
        .pc-mode-light .pc-sticky-title strong { color: var(--pc-accent-1); }
        .pc-mode-light .pc-sticky-title .pc-shine-text,
        .pc-mode-light .pc-sticky-streak-inline .pc-shine-text {
          background: none;
          animation: none;
          -webkit-text-fill-color: var(--pc-sticky-strong);
          color: var(--pc-sticky-strong);
        }
        .pc-mode-light .pc-sticky-streak-inline { color: var(--pc-sticky-strong); }

        .pc-mode-light .pc-sticky-sub { color: var(--pc-sticky-muted); }

        @media (prefers-reduced-motion: reduce) {
          .pc-row-fill, .pc-shine-text, .pc-nick-metal { animation: none !important; background-position: 0% 50% !important; }
          .pc-podium-card { opacity: 1 !important; transform: none !important; animation: none !important; }
          .pc-drawer { animation: none !important; }
        }

        @media (max-width: 420px) {
          .pc-avatar-podium { width: 46px; height: 46px; }
          .pc-podium-nick { font-size: 12.5px; }
          .pc-header-center { padding: 0 54px; }
          .pc-title-line1 { font-size: 19px; letter-spacing: 0.03em; }
        }
      `}</style>

      <div className="pc-header-center">
        <div className="pc-title-line1">Classifica Globale</div>
        <div className="pc-title-line2">migliori atleti di {currentMonth.monthName}</div>
      </div>

      <div className="pc-podium">
        {podiumOrder.map(({ athlete: a, position, delay }) => (
          <PodiumCard key={a.rank} athlete={a} position={position} delay={delay} onSelect={setSelectedAthlete} />
        ))}
      </div>

      <div className="pc-list">
        {restOfList.map((a) => (
          <LeaderboardRow key={a.rank} athlete={a} maxXP={maxXP} onSelect={setSelectedAthlete} />
        ))}
      </div>

      <button type="button" className="pc-archive-btn"
              onClick={() => { setDrawerOpen(true); if (isRealMode) loadRealArchive(); }}>
        🏛️ Archivio Storico Report
      </button>

      <StickyUserBar
        isCurrent={currentMonth.isCurrent}
        rank={currentMonth.userResult.rank}
        xp={currentMonth.userResult.xp}
        gapToTop10={gapToTop10}
        avatarUrl={isRealMode ? null : USER_AVATAR_URL}
        level={currentMonth.userResult.level}
        streakDays={currentMonth.userResult.streakDays}
      />

      <ArchiveDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        months={pastMonths}
        expandedId={expandedMonthId}
        onToggleExpand={handleToggleExpand}
        loading={isRealMode && archiveLoading}
        empty={isRealMode && !archiveLoading && pastMonths.length === 0}
        showLaunchLabel={!isRealMode}
        onSelectAthlete={setSelectedAthlete}
      />

      <AthleteDetailModal athlete={selectedAthlete} onClose={() => setSelectedAthlete(null)} />
    </div>
  );
}
