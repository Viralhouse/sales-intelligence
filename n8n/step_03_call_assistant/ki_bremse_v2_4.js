// =====================================================
// KI-BREMSE v2.3 – Context Packager Output + Burst Pacing + Ref Query
// IMPROVED: Intelligent 66-Branch Detection with Fallback
// Input erwartet:
//  - live_context.you / live_context.them
//  - live_context.talk_ratio_pct_you / talk_ratio_pct_them
//  - live_context.duration_sec
//  - memory_context.customer / topics
// =====================================================

const staticData = $getWorkflowStaticData("global");

// -----------------------------
// CONFIG
// -----------------------------
const MIN_WPM_WINDOW_SEC = 15;
const STABLE_MAX_SEC = 60;
const BURST_MIN_SEC = 10;
const BURST_MAX_SEC = 25;

const DOMINANCE_WINDOW_N = 8;
const DOM_YOU = 60;
const DOM_THEM = 40;

const PACE_FAST_WPM = 170;
const PACE_SLOW_WPM = 70;

// -----------------------------
// INPUT
// -----------------------------
const live = $json.live_context || {};
const mem = $json.memory_context || {};

function firstNonEmpty(...vals) {
  for (const v of vals) {
    if (v !== null && v !== undefined) {
      const s = String(v).trim();
      if (s) return s;
    }
  }
  return "";
}

function safeNode(pathFn) {
  try { return pathFn(); } catch (_) { return null; }
}

const session_id = firstNonEmpty(
  $json.session_id,
  live.session_id,
  mem.session_id
) || null;

const lead_id = firstNonEmpty(
  $json.lead_id,
  live.lead_id,
  mem.lead_id,
  safeNode(() => $('Webhook1').first().json.body.ID),
  safeNode(() => $('Get row(s)').first().json.lead_id),
  safeNode(() => $('Get row(s)').first().json.id)
) || 'unknown_lead';

const liveYouText = String(live.you || "").trim();
const liveThemText = String(live.them || "").trim();

const talk_you_raw = live.talk_ratio_pct_you;
const talk_them_raw = live.talk_ratio_pct_them;

const memory_topics = Array.isArray(mem.topics) ? mem.topics : [];
const memory_context_text = String(mem.customer || "").trim();

// duration clamp
let duration_sec = Number(live.duration_sec ?? 0);
if (!Number.isFinite(duration_sec) || duration_sec <= 0) duration_sec = 60;
duration_sec = Math.max(5, Math.min(120, duration_sec));

// stable/burst windows
const stableDurationSec = Math.min(STABLE_MAX_SEC, Math.max(MIN_WPM_WINDOW_SEC, duration_sec));
const burstDurationSec = Math.min(BURST_MAX_SEC, Math.max(BURST_MIN_SEC, duration_sec));
// -----------------------------
// HELPERS
// -----------------------------
function countWords(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function pacingStatusFromWpm(wpm) {
  if (!wpm || wpm <= 0) return "n/a";
  if (wpm > PACE_FAST_WPM) return "too_fast";
  if (wpm < PACE_SLOW_WPM) return "too_slow";
  return "ok";
}

function clip(s, n) {
  s = String(s || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  return s.length > n ? s.slice(0, n) : s;
}

// -----------------------------
// WORDS
// -----------------------------
const words_you = countWords(liveYouText);
const words_them = countWords(liveThemText);

// -----------------------------
// WPM (Stable + Burst)
// -----------------------------
const wpm_you = Math.round((words_you / stableDurationSec) * 60);
const wpm_them = Math.round((words_them / stableDurationSec) * 60);

const wpm_burst_you = Math.round((words_you / burstDurationSec) * 60);
const wpm_burst_them = Math.round((words_them / burstDurationSec) * 60);

const pacing_you = pacingStatusFromWpm(wpm_burst_you);
const pacing_them = pacingStatusFromWpm(wpm_burst_them);

// -----------------------------
// TALK RATIO (prefer live metrics)
// -----------------------------
let talk_ratio_pct_you = (typeof talk_you_raw === "number") ? talk_you_raw : null;
let talk_ratio_pct_them = (typeof talk_them_raw === "number") ? talk_them_raw : null;

if (talk_ratio_pct_you === null || talk_ratio_pct_them === null) {
  const total = words_you + words_them;
  talk_ratio_pct_you = total > 0 ? Math.round((words_you / total) * 100) : 0;
  talk_ratio_pct_them = total > 0 ? 100 - talk_ratio_pct_you : 0;
}

talk_ratio_pct_you = Math.max(0, Math.min(100, talk_ratio_pct_you));
talk_ratio_pct_them = Math.max(0, Math.min(100, talk_ratio_pct_them));

// -----------------------------
// DOMINANCE (rolling avg)
// -----------------------------
if (!Array.isArray(staticData.talk_ratio_memory)) staticData.talk_ratio_memory = [];
staticData.talk_ratio_memory.push(talk_ratio_pct_you);
staticData.talk_ratio_memory = staticData.talk_ratio_memory.slice(-DOMINANCE_WINDOW_N);

const avg_you = Math.round(
  staticData.talk_ratio_memory.reduce((a,b) => a + b, 0) / staticData.talk_ratio_memory.length
);

let dominates = "balanced";
if (avg_you > DOM_YOU) dominates = "you";
else if (avg_you < DOM_THEM) dominates = "them";

// -----------------------------
// WARNINGS
// -----------------------------
const burst_warning = (wpm_burst_you > PACE_FAST_WPM);
const pacing_warning = (pacing_you === "too_fast") || burst_warning;
const talk_ratio_warning = (dominates === "you") || (talk_ratio_pct_you > 55);

// -----------------------------
// CONTEXT for AI
// -----------------------------
const live_context_text = `THEM: ${liveThemText}\nYOU: ${liveYouText}`.trim();

// =====================================================
// BRANCHENFILTER v2.0 – Alle 66 Branchen mit Keywords
// =====================================================

// Komplette Liste aller 66 Branchen mit UMFASSENDEN Keywords (15-25 pro Branche)
const BRANCHE_KEYWORDS = {
  // =====================================================
  // KUNST & KULTUR
  // =====================================================
  "Kunst": [
    "kunst", "künstler", "galerie", "gemälde", "skulptur", "kunstwerk", "atelier", "malerei", "bildhauer", "kunsthandwerk",
    "ausstellung", "vernissage", "kunstausstellung", "moderne kunst", "zeitgenössische kunst", "ölgemälde", "aquarell",
    "installation", "kunstgalerie", "kunstsammlung", "kunstobjekt", "kunstszene", "kunstmarkt", "artsy", "art",
    "kreativität", "expressionismus", "abstrakt", "realismus", "portrait", "landschaftsmalerei", "grafik", "druckgrafik",
    "lithografie", "radierung", "kunstprojekt", "kunstförderung", "kulturförderung", "kunstverein", "atelierbesuch"
  ],
  "Kino": [
    "kino", "film", "movie", "leinwand", "popcorn", "blockbuster", "premiere", "kinosaal", "filmvorführung",
    "kinofilm", "filmabend", "kinokarte", "kinoticket", "multiplex", "arthouse", "programmkino", "filmtheater",
    "3d kino", "imax", "dolby", "surround", "filmstart", "kinobesuch", "sneak preview", "filmpalast",
    "kinoprogramm", "spielfilm", "dokumentarfilm", "kurzfilm", "trailer", "vorschau", "kinosessel", "filmrolle",
    "kinogutschein", "kinoabend", "open air kino", "sommerkino", "autokino", "filmfestival"
  ],
  "Museen": [
    "museum", "ausstellung", "sammlung", "artefakt", "kurator", "museumspädagogik", "dauerausstellung",
    "sonderausstellung", "wechselausstellung", "exponat", "kunstmuseum", "naturkundemuseum", "historisches museum",
    "technikmuseum", "völkerkundemuseum", "stadtmuseum", "heimatmuseum", "freilichtmuseum", "museumsführung",
    "audioguide", "museumshop", "museumsbesuch", "kulturgeschichte", "archäologie", "antiquitäten", "reliquie",
    "museumsinsel", "kulturerbe", "weltkulturerbe", "restaurierung", "konservierung", "depotführung", "schausammlung"
  ],
  "Theater": [
    "theater", "bühne", "schauspiel", "aufführung", "premiere", "ensemble", "theaterstück", "regie", "dramaturgie",
    "theatervorstellung", "schauspielhaus", "staatstheater", "stadttheater", "komödie", "tragödie", "drama",
    "musical", "oper", "operette", "ballett", "theaterkarte", "parkett", "rang", "loge", "vorhang",
    "applaus", "zugabe", "pause", "garderobe", "bühnenbild", "kostüm", "maske", "souffleur", "intendant",
    "spielzeit", "repertoire", "uraufführung", "gastspiel", "tournee", "theaterabonnement", "kulturticket"
  ],
  "Konzerte": [
    "konzert", "live musik", "festival", "orchester", "band", "auftritt", "bühne", "open air", "musikveranstaltung",
    "konzerthalle", "philharmonie", "arena", "stadion", "club konzert", "akustik", "soundcheck", "setlist",
    "encore", "zugabe", "moshpit", "standing", "sitzplatz", "konzertticket", "vorverkauf", "abendkasse",
    "headliner", "support act", "vorband", "tour", "tournee", "album release", "unplugged", "acoustic",
    "sinfoniekonzert", "kammerkonzert", "jazzkonzert", "rockkonzert", "popkonzert", "klassik", "weltmusik"
  ],
  "Shows / Austellungen": [
    "show", "vorstellung", "performance", "darbietung", "entertainment", "spektakel", "bühnenprogramm",
    "varieté", "kabarett", "comedy", "magic show", "zauberer", "akrobatik", "artistik", "zirkus",
    "revue", "dinner show", "talentshow", "gameshow", "live show", "talkshow", "late night",
    "unterhaltung", "showact", "moderation", "entertainer", "publikum", "interaktiv", "lichtshow", "lasershow",
    "feuerwerk", "pyrotechnik", "special effects", "stunts", "illusionist", "bauchredner"
  ],

  // =====================================================
  // GASTRONOMIE (nur bei klaren Hinweisen!)
  // =====================================================
  "Fine Dining": [
    "fine dining", "gourmet", "sterne restaurant", "michelin", "haute cuisine", "degustationsmenü", "sommelier", "edel restaurant",
    "sterneküche", "spitzenküche", "gehobene küche", "kulinarisch", "gänge menü", "amuse bouche", "tasting menu",
    "weinbegleitung", "weinkarte", "champagner", "trueffel", "kaviar", "hummer", "gourmetküche", "feinschmecker",
    "luxus restaurant", "premium dining", "exklusiv essen", "nobel restaurant", "chef table", "küchenchef",
    "sternekoch", "bocuse", "guide michelin", "gault millau", "kulinarische reise", "geschmackserlebnis"
  ],
  "Casual Dining": [
    "restaurant", "essen gehen", "speisekarte", "menü", "kellner", "reservierung", "abendessen", "mittagessen", "tisch reservieren",
    "lokal", "gaststätte", "gasthaus", "gasthof", "wirtshaus", "trattoria", "bistro", "brasserie", "taverne",
    "ristorante", "cucina", "küche", "koch", "bedienung", "service", "rechnung", "trinkgeld", "tagesmenü",
    "mittagstisch", "businesslunch", "familienrestaurant", "brunch", "frühstück", "vorspeise", "hauptgang", "dessert",
    "nachtisch", "beilage", "getränkekarte", "hausmannskost", "regionale küche", "internationale küche", "buffet"
  ],
  "Fast Food": [
    "fast food", "burger", "pizza", "hotdog", "pommes", "schnellimbiss", "drive through", "takeaway", "döner", "kebab",
    "imbiss", "snack", "quick service", "systemgastronomie", "mcdonalds", "burger king", "subway", "kfc",
    "five guys", "shake shack", "currywurst", "bratwurst", "falafel", "wrap", "burrito", "taco",
    "nuggets", "chicken wings", "onion rings", "milchshake", "softdrink", "cola", "combo menü", "happy meal",
    "to go", "mitnehmen", "selbstbedienung", "food court", "schnellrestaurant", "fritteuse", "grill"
  ],
  "Cafés": [
    "café", "kaffee", "cappuccino", "espresso", "latte", "matcha", "kuchen", "konditorei", "kaffeebar", "barista",
    "coffee shop", "kaffeehaus", "kaffeespezialitäten", "filterkaffee", "cold brew", "flat white", "americano",
    "macchiato", "mokka", "croissant", "gebäck", "torte", "patisserie", "backstube", "bäckerei",
    "frühstückscafé", "brunch café", "kaffee und kuchen", "nachmittagskaffee", "kaffeepause", "kaffeeklatsch",
    "heißgetränk", "tee", "chai latte", "heiße schokolade", "kakao", "smoothie", "säfte", "bagel", "sandwich café"
  ],
  "Lieferdienste": [
    "lieferdienst", "lieferando", "uber eats", "delivery", "zustellung", "essen bestellen", "lieferung",
    "wolt", "deliveroo", "just eat", "foodora", "gorillas", "flink", "getir", "online bestellen",
    "app bestellen", "lieferzeit", "mindestbestellwert", "liefergebühr", "kontaktlose lieferung", "expresslieferung",
    "hauslieferung", "bürolieferung", "catering lieferung", "meal kit", "kochbox", "hellofresh", "marley spoon",
    "lieferadresse", "nachverfolgung", "tracking", "lieferstatus", "bestellung aufgeben", "warenkorb"
  ],
  "Bars": [
    "bar", "cocktail", "drinks", "longdrink", "barkeeper", "spirituosen", "aperitif", "happy hour",
    "cocktailbar", "weinbar", "whiskybar", "gin bar", "craft beer bar", "mixology", "bartender", "shaker",
    "on the rocks", "neat", "shot", "shooter", "digestif", "bitters", "vermouth", "martini",
    "mojito", "caipirinha", "margarita", "moscow mule", "old fashioned", "negroni", "spritz", "aperol",
    "barhocker", "theke", "tresen", "zapfhahn", "fassbier", "flaschenbier", "weinprobe", "verkostung"
  ],
  "Clubs": [
    "club", "disco", "dj", "tanzen", "nachtleben", "party", "techno", "elektro", "nachtclub",
    "nightclub", "tanzclub", "discotheque", "rave", "afterhour", "clubbing", "clubnacht", "dancefloor",
    "tanzfläche", "vip bereich", "bottle service", "türsteher", "gästeliste", "dresscode", "eintritt",
    "house musik", "edm", "hip hop club", "latin club", "r&b", "resident dj", "guest dj", "lineup",
    "soundsystem", "lightshow", "stroboskop", "nebelmaschine", "konfetti", "gogo", "clubkultur"
  ],
  "Lounges": [
    "lounge", "chillen", "entspannen", "shisha", "hookah", "ambient", "chill out", "lounge musik",
    "shisha bar", "shisha lounge", "wasserpfeife", "tabak", "kohle", "molasse", "shisha cafe",
    "cocktail lounge", "hotel lounge", "airport lounge", "business lounge", "vip lounge", "sky lounge",
    "gemütlich", "sofa", "sessel", "kissen", "gedämpftes licht", "kerzen", "atmosphäre", "ambiente",
    "hintergrundmusik", "plaudern", "treffen", "afterwork", "date night", "exklusiv", "members club"
  ],
  "Rooftops": [
    "rooftop", "dachterrasse", "skyline", "dachbar", "rooftop bar", "rooftop restaurant", "rooftop lounge",
    "dachgeschoss", "aussicht", "panorama", "stadtblick", "sonnenuntergang", "sunset", "open air bar",
    "terrassenbar", "sky bar", "high rise", "penthouse bar", "dachgarten", "roof garden", "urban gardening",
    "sommernächte", "sternenbar", "moonlight", "outdoor dining", "alfresco", "sonnenschirm", "heizstrahler",
    "blanket", "decke", "instagram spot", "foto location", "influencer", "trendy", "hotspot"
  ],

  // =====================================================
  // FITNESS & SPORT
  // =====================================================
  "Fitness": [
    "fitness", "fitnessstudio", "gym", "training", "workout", "sport", "krafttraining", "cardio", "muskelaufbau",
    "ausdauer", "kondition", "bewegung", "körper", "gesundheit", "fit werden", "in form kommen", "abnehmen",
    "gewicht verlieren", "muskeln", "definition", "bulk", "cut", "gains", "pump", "schwitzen",
    "trainingsplan", "übungen", "wiederholungen", "sätze", "gewichte", "hanteln", "langhantel", "kurzhantel",
    "kniebeugen", "bankdrücken", "kreuzheben", "klimmzüge", "liegestütze", "plank", "burpees", "hiit"
  ],
  "Fitnessstudios": [
    "fitnessstudio", "gym", "mcfit", "fitness first", "john reed", "clever fit", "gerätetraining",
    "studio", "trainingsbereich", "freihantelbereich", "cardiobereich", "kursraum", "spinning raum",
    "umkleide", "dusche", "spind", "locker", "mitgliedschaft", "abo", "probetraining", "einweisung",
    "geräteeinweisung", "trainer", "fitnesstrainer", "studioleitung", "öffnungszeiten", "24h fitness",
    "frauen fitness", "ladys gym", "premium gym", "budget gym", "boutique gym", "crossfit box"
  ],
  "Yoga & Pilates": [
    "yoga", "pilates", "meditation", "achtsamkeit", "asana", "yogastudio", "yogakurs", "stretching",
    "yogamatte", "yogablock", "yogagurt", "yogakissen", "meditationskissen", "pranayama", "atmung",
    "vinyasa", "hatha yoga", "ashtanga", "bikram", "hot yoga", "yin yoga", "kundalini", "power yoga",
    "flow", "sonnengruß", "krieger", "herabschauender hund", "shavasana", "namaste", "om",
    "pilates ring", "pilates ball", "reformer", "cadillac", "core training", "beckenboden", "flexibilität"
  ],
  "Personal Training": [
    "personal trainer", "pt", "personaltraining", "coach", "einzeltraining", "fitnesstrainer",
    "personal coach", "privattrainer", "1:1 training", "individuelles training", "maßgeschneidert",
    "trainingsbetreuung", "ernährungsberatung", "ernährungsplan", "trainingsplan erstellen", "zielsetzung",
    "motivation", "accountability", "fortschrittskontrolle", "körperanalyse", "inbody", "körperfett",
    "muskelanteil", "transformation", "vorher nachher", "success story", "bootcamp", "outdoor training",
    "hausbesuch", "firmentraining", "gruppentraining klein", "duo training", "partner workout"
  ],
  "Kampfsport": [
    "kampfsport", "boxen", "mma", "karate", "judo", "kickboxen", "taekwondo", "selbstverteidigung", "jiu jitsu",
    "brazilian jiu jitsu", "bjj", "muay thai", "thaiboxen", "kung fu", "wing chun", "krav maga",
    "aikido", "hapkido", "capoeira", "wrestling", "ringen", "grappling", "submission", "sparring",
    "pratzen", "sandsack", "boxhandschuhe", "mundschutz", "tiefschutz", "schienbeinschoner", "kopfschutz",
    "gürtel", "dan", "kyu", "dojo", "tatami", "ring", "käfig", "octagon", "wettkampf", "turnier"
  ],

  // =====================================================
  // GESUNDHEIT & MEDIZIN
  // =====================================================
  "Ärzte": [
    "arzt", "praxis", "sprechstunde", "termin", "patient", "mediziner", "doktor", "hausarzt", "facharzt",
    "arztpraxis", "arzttermin", "wartezimmer", "behandlung", "untersuchung", "diagnose", "rezept",
    "überweisung", "krankschreibung", "attest", "impfung", "vorsorge", "check up", "gesundheitscheck",
    "blutabnahme", "labor", "befund", "ultraschall", "röntgen", "ekg", "blutdruck", "puls",
    "allgemeinmedizin", "internist", "kardiologe", "dermatologe", "hno", "orthopäde", "neurologe", "urologe"
  ],
  "Kliniken": [
    "klinik", "krankenhaus", "hospital", "station", "chirurgie", "notaufnahme", "ambulanz",
    "privatklinik", "tagesklinik", "fachklinik", "reha klinik", "spezialklinik", "universitätsklinikum",
    "op", "operation", "eingriff", "narkose", "intensivstation", "bettstation", "visite", "chefarzt",
    "oberarzt", "assistenzarzt", "pfleger", "krankenschwester", "patientenaufnahme", "entlassung",
    "krankenhausaufenthalt", "stationär", "ambulant", "notfall", "rettungswagen", "hubschrauber"
  ],
  "Augenkliniken": [
    "augenklinik", "augenarzt", "lasik", "augenoperation", "sehtest", "optiker", "brille", "kontaktlinsen",
    "augenheilkunde", "ophthalmologie", "augenärztlich", "sehkraft", "sehstärke", "dioptrien", "kurzsichtig",
    "weitsichtig", "hornhautverkrümmung", "astigmatismus", "grauer star", "katarakt", "grüner star", "glaukom",
    "netzhaut", "makula", "augeninnendruck", "augentropfen", "femto lasik", "smile", "prk", "icl linsen",
    "linsenimplantation", "augenlaserbehandlung", "brillenfreiheit", "nachuntersuchung", "augenlid"
  ],
  "Therapien": [
    "therapie", "physiotherapie", "psychotherapie", "ergotherapie", "rehabilitation", "therapeut", "behandlung",
    "krankengymnastik", "manuelle therapie", "lymphdrainage", "massage medizinisch", "wärmetherapie", "kältetherapie",
    "elektrotherapie", "ultraschalltherapie", "rehasport", "funktionstraining", "bewegungstherapie",
    "sprachtherapie", "logopädie", "verhaltenstherapie", "gesprächstherapie", "traumatherapie", "schmerztherapie",
    "heilpraktiker", "osteopathie", "chiropraktik", "akupunktur", "naturheilkunde", "alternativmedizin"
  ],

  // =====================================================
  // BEAUTY & WELLNESS
  // =====================================================
  "Hair": [
    "friseur", "haare", "haarschnitt", "hairstylist", "salon", "färben", "strähnen", "styling", "barbershop",
    "friseursalon", "haarsalon", "coiffeur", "hair stylist", "haarfarbe", "blondierung", "balayage", "ombre",
    "highlights", "lowlights", "tönung", "dauerwelle", "glätten", "keratin", "extensions", "haarverlängerung",
    "trockenschnitt", "nassschnitt", "waschen schneiden föhnen", "föhnen", "locken", "glätteisen",
    "hochsteckfrisur", "brautfrisur", "herrenschnitt", "fade", "undercut", "bart trimmen", "rasur", "barber"
  ],
  "Nails": [
    "nagelstudio", "maniküre", "pediküre", "nailart", "gelnägel", "nagellack", "nails",
    "nagelpflege", "kunstnägel", "acrylnägel", "shellac", "gel polish", "uv lampe", "led lampe",
    "nagelverlängerung", "nagelmodellage", "french nails", "babyboomer", "ombre nails", "chrome nails",
    "glitter nails", "nail design", "nageldesign", "stempel", "sticker", "strass", "glitzer",
    "feilen", "polieren", "nagelhaut", "cuticle", "hand massage", "fuß massage", "fußpflege", "podologie"
  ],
  "Brows & Lashes": [
    "augenbrauen", "wimpern", "lash", "brow", "microblading", "wimpernverlängerung", "browbar",
    "lash extensions", "wimpernextensions", "volume lashes", "classic lashes", "mega volume", "russian volume",
    "wimpernlifting", "lash lift", "wimpernwelle", "wimpernfärben", "augenbrauenfärben", "brow tinting",
    "augenbrauenform", "zupfen", "waxing brauen", "threading", "brow lamination", "powder brows",
    "microshading", "nano brows", "ombre brows", "permanentmakeup", "pmu", "nachbehandlung", "auffüllen"
  ],
  "Medical Beauty": [
    "botox", "filler", "hyaluron", "aesthetik", "schönheitschirurgie", "lifting", "laserbehandlung", "anti-aging",
    "hyaluronsäure", "lippenunterspritzung", "faltenbehandlung", "stirnfalten", "zornesfalte", "krähenfüße",
    "nasolabialfalte", "volumenaufbau", "wangenaufbau", "kinnkorrektur", "nasenkorrektur", "fadenlifting",
    "ultherapy", "thermage", "microneedling", "prp", "vampirlifting", "mesotherapie", "skinbooster",
    "fruchtsäurepeeling", "chemical peel", "dermabrasion", "laserhaarentfernung", "ipl", "tattooentfernung"
  ],
  "Spas": [
    "spa", "wellness", "massage", "sauna", "entspannung", "beauty", "day spa", "hamam",
    "wellnesshotel", "spa resort", "beauty farm", "therme", "thermalbad", "solebad", "whirlpool", "jacuzzi",
    "dampfbad", "dampfsauna", "finnische sauna", "bio sauna", "infrarot sauna", "eisbrunnen", "ruheraum",
    "entspannungsliege", "bademantel", "slipper", "körperpeeling", "body scrub", "körperpackung", "detox",
    "aromaöl", "hot stone", "thai massage", "ayurveda", "lomi lomi", "shiatsu", "reflexzonenmassage"
  ],

  // =====================================================
  // EVENTS & ERLEBNISSE
  // =====================================================
  "Events & Shows": [
    "event", "veranstaltung", "eventlocation", "feier", "party", "gala", "firmenfeier",
    "firmenevent", "corporate event", "teambuilding", "incentive", "kongress", "konferenz", "tagung",
    "messe", "ausstellung event", "produktpräsentation", "launch event", "jubiläum", "eröffnung",
    "sommerfest", "weihnachtsfeier", "betriebsfeier", "abschlussfeier", "hochzeit", "geburtstag", "taufe",
    "catering", "dekoration", "eventplanung", "eventmanagement", "eventorganisation", "moderator", "dj event"
  ],
  "Ausstellungen / Abenteuer": [
    "ausstellung", "abenteuer", "erlebnis", "escape room", "lasertag", "paintball", "freizeitpark",
    "erlebnispark", "themenpark", "achterbahn", "karussell", "fahrgeschäft", "gruselkabinett", "spukhaus",
    "interaktive ausstellung", "mitmachausstellung", "science center", "planetarium", "aquarium", "zoo",
    "tierpark", "kletterpark", "hochseilgarten", "trampolinhalle", "jumphouse", "kartbahn", "gokart",
    "bowling", "minigolf", "schwarzlicht minigolf", "billard", "dart", "spielhalle", "arcade"
  ],
  "Workshops / Kunst": [
    "workshop", "kurs", "seminar", "kreativkurs", "malkurs", "töpfern", "handwerk lernen",
    "kreativworkshop", "bastelkurs", "nähkurs", "strickkurs", "häkeln", "makramee", "keramik", "porzellan",
    "glaskunst", "schmieden", "holzarbeiten", "tischlerkurs", "upcycling", "diy workshop", "lettering",
    "kalligraphie", "aquarell workshop", "ölmalerei kurs", "zeichenkurs", "aktzeichnen", "fotokurs",
    "kochkurs", "backkurs", "barista kurs", "cocktailkurs", "weinverkostung", "gin tasting", "whisky tasting"
  ],
  "VR / AR": [
    "virtual reality", "vr", "augmented reality", "ar", "vr brille", "immersiv", "virtuell",
    "vr erlebnis", "vr gaming", "vr spiele", "vr arcade", "vr escape room", "vr flugsimulator",
    "vr achterbahn", "360 grad", "mixed reality", "mr", "extended reality", "xr", "metaverse",
    "oculus", "htc vive", "playstation vr", "quest", "hologramm", "3d erlebnis", "simulation",
    "virtuelle welten", "avatar", "motion tracking", "controller", "headset", "interaktiv digital"
  ],
  "Outdoor Erlebnisse": [
    "outdoor", "wandern", "klettern", "rafting", "paragliding", "natur", "abenteuer outdoor", "survival",
    "trekking", "bergsteigen", "mountainbike", "mtb", "downhill", "trail", "waldwanderung", "naturerlebnis",
    "camping", "zelten", "lagerfeuer", "bushcraft", "wildnis", "orientierung", "geocaching", "schnitzeljagd",
    "kanufahren", "kayak", "sup", "stand up paddling", "segeln", "surfen", "kitesurfen", "tauchen",
    "schnorcheln", "canyoning", "bungee jumping", "fallschirmspringen", "gleitschirmfliegen", "zipline"
  ],
  "Saisonale Events (Sommer / Winter)": [
    "sommer event", "winter event", "weihnachtsmarkt", "sommerfest", "winterfest", "saisonal",
    "frühlingsfest", "herbstfest", "oktoberfest", "volksfest", "kirmes", "jahrmarkt", "stadtfest",
    "straßenfest", "weinfest", "bierfest", "erntedankfest", "fasching", "karneval", "fastnacht",
    "silvester", "neujahr", "ostern", "ostermarkt", "pfingsten", "maifest", "tanz in den mai",
    "sommernachtsfest", "open air sommer", "beachparty", "poolparty", "grillparty", "gartenparty"
  ],

  // =====================================================
  // LOCATIONS
  // =====================================================
  "Indoor-Locations": [
    "indoor", "halle", "innenraum", "location indoor", "veranstaltungshalle", "eventhalle",
    "kongresshalle", "messehalle", "sporthalle", "mehrzweckhalle", "stadthalle", "kulturhalle",
    "festsaal", "ballsaal", "bankettsaal", "konferenzraum", "seminarraum", "tagungsraum", "meetingraum",
    "loft", "warehouse", "fabrikhalle", "industriehalle", "atelier location", "galerie location",
    "club location", "bar location", "restaurant privat", "separee", "gewölbekeller", "bunker"
  ],
  "Outdoor-Locations": [
    "outdoor location", "freiluft", "open air", "biergarten", "terrasse", "draußen",
    "garten location", "parkanlage", "schlosspark", "botanischer garten", "weinberg", "strand location",
    "seeufer", "flussufer", "waldlichtung", "wiese", "feld", "bauernhof", "scheune", "landgut",
    "weingut", "innenhof", "atrium", "dachgarten location", "rooftop event", "zelt", "festzelt",
    "pavillon", "pergola", "orangerie", "gewächshaus", "strandbar", "beachclub"
  ],

  // =====================================================
  // SHOPPING & RETAIL
  // =====================================================
  "Einkaufszentren": [
    "einkaufszentrum", "shopping mall", "mall", "shopping center", "galeria", "kaufhaus",
    "shoppingcenter", "einkaufspassage", "arkaden", "galerie", "outlet", "factory outlet", "designer outlet",
    "shopping meile", "fußgängerzone", "innenstadt", "city", "ladenzeile", "geschäfte", "läden",
    "einzelhandel", "retail", "flagship store", "concept store", "pop up store", "showroom",
    "food court", "gastro meile", "parkhaus", "tiefgarage", "sonntagsverkauf", "late night shopping"
  ],
  "Premium Fashion": [
    "premium", "luxus", "designer mode", "high fashion", "haute couture", "exklusiv", "luxusmarke",
    "luxury", "high end", "prestige", "nobel", "erstklassig", "premium brand", "designerlabel",
    "gucci", "prada", "louis vuitton", "chanel", "dior", "hermes", "burberry", "balenciaga",
    "bottega veneta", "saint laurent", "versace", "armani", "valentino", "fendi", "loewe",
    "luxusboutique", "flagship", "personal shopping", "vip service", "made to measure", "maßanfertigung"
  ],
  "Streetwear": [
    "streetwear", "sneaker", "urban", "hypebeast", "supreme", "off-white", "streetstyle",
    "urban fashion", "street fashion", "skate style", "hip hop style", "casual wear", "hoodies",
    "jogginghose", "jogger", "trainingsanzug", "tracksuit", "cap", "snapback", "beanie",
    "nike", "adidas", "jordan", "yeezy", "new balance", "converse", "vans", "puma",
    "palace", "stussy", "bape", "kith", "fear of god", "essentials", "limited edition", "drop", "raffle"
  ],
  "Second Hand / Vintage": [
    "second hand", "vintage", "gebraucht", "retro", "flohmarkt", "thrift",
    "secondhand laden", "vintage shop", "retro boutique", "used clothing", "pre owned", "pre loved",
    "nachhaltig mode", "sustainable fashion", "circular fashion", "upcycled", "recycled", "öko mode",
    "70er", "80er", "90er", "oldschool", "antik", "sammlerstück", "collector", "rare", "selten",
    "trödel", "antiquitätenladen", "kommission", "consignment", "ankauf verkauf", "tauschbörse"
  ],
  "Designer": [
    "designer", "haute couture", "modeschöpfer", "luxusmode", "prêt-à-porter",
    "fashion designer", "modedesigner", "couturier", "atelier mode", "kollektion", "collection",
    "runway", "laufsteg", "fashion week", "modenschau", "catwalk", "model", "mannequin",
    "schneiderei", "maßschneider", "bespoke", "custom made", "handgefertigt", "handmade",
    "stoffauswahl", "schnittmuster", "entwurf", "sketch", "design", "kreation", "unikat", "einzelstück"
  ],
  "Schmuck & Juweliere": [
    "schmuck", "juwelier", "gold", "silber", "diamant", "uhren", "accessoires", "kette", "ring",
    "goldschmied", "schmuckgeschäft", "juweliergeschäft", "edelstein", "brillant", "rubin", "saphir", "smaragd",
    "perle", "platin", "weißgold", "roségold", "925 silber", "sterling", "vergoldet", "versilbert",
    "armband", "armreif", "anhänger", "ohrring", "ohrstecker", "creolen", "brosche", "manschettenknöpfe",
    "verlobungsring", "ehering", "trauring", "gravur", "reparatur schmuck", "reinigung schmuck", "schätzung"
  ],

  // =====================================================
  // RETAIL & STORES
  // =====================================================
  "Interior": [
    "interior", "möbel", "einrichtung", "dekoration", "wohndesign", "interieur", "wohnaccessoires",
    "möbelhaus", "einrichtungshaus", "wohnstudio", "design möbel", "designermöbel", "sofa", "couch",
    "sessel", "stuhl", "tisch", "esstisch", "couchtisch", "schrank", "regal", "kommode", "bett",
    "matratze", "lampe", "leuchte", "teppich", "vorhang", "gardine", "kissen", "decke", "vase",
    "bilderrahmen", "spiegel", "kerze", "duftkerze", "raumduft", "zimmerpflanze", "blumentopf"
  ],
  "Elektronik": [
    "elektronik", "technik", "smartphone", "computer", "tablet", "gadgets", "mediamarkt", "saturn",
    "handy", "iphone", "samsung", "laptop", "notebook", "pc", "desktop", "monitor", "bildschirm",
    "fernseher", "tv", "smart tv", "soundbar", "lautsprecher", "kopfhörer", "airpods", "bluetooth",
    "kamera", "drohne", "spielkonsole", "playstation", "xbox", "nintendo", "gaming", "zubehör",
    "ladekabel", "powerbank", "adapter", "smart home", "alexa", "google home", "wearables", "smartwatch"
  ],
  "Pflanzen": [
    "pflanzen", "blumen", "gärtnerei", "florist", "zimmerpflanzen", "garten", "blumenladen",
    "blumengeschäft", "pflanzencenter", "gartencenter", "baumschule", "stauden", "sträucher", "bäume",
    "balkonpflanzen", "terrassenpflanzen", "kübelpflanzen", "hängepflanzen", "sukkulenten", "kakteen",
    "orchideen", "rosen", "tulpen", "schnittblumen", "blumenstrauß", "gesteck", "kranz", "trauerfloristik",
    "hochzeitsfloristik", "eventfloristik", "pflanzenpflege", "umtopfen", "dünger", "erde", "topf", "übertopf"
  ],
  "Lifestyle Stores  I Sport": [
    "lifestyle", "concept store", "sportgeschäft", "sportartikel", "decathlon", "intersport",
    "sports direct", "snipes", "foot locker", "jd sports", "sportbekleidung", "funktionskleidung",
    "outdoor bekleidung", "wanderschuhe", "laufschuhe", "fußballschuhe", "tennisschläger", "golfschläger",
    "fahrrad", "e-bike", "fitness equipment", "yogamatte shop", "supplements", "proteinpulver",
    "lifestyle produkte", "trend produkte", "design artikel", "geschenkartikel", "wohlfühlprodukte"
  ],

  // =====================================================
  // TECHNOLOGIE & IT
  // =====================================================
  "IT, Apps & Geräte": [
    "it", "software", "app", "technologie", "tech", "digital", "programmierung", "entwickler", "startup tech",
    "it firma", "softwareentwicklung", "webentwicklung", "app entwicklung", "mobile app", "ios", "android",
    "saas", "cloud", "server", "hosting", "domain", "website", "webseite", "homepage", "online",
    "datenbank", "api", "backend", "frontend", "ux", "ui", "design digital", "it beratung", "it service",
    "it support", "helpdesk", "systemadministrator", "netzwerk", "cybersecurity", "datenschutz", "ki", "ai"
  ],
  "Diverses": [
    "divers", "verschiedenes", "sonstiges", "mixed", "allgemein", "andere", "weitere", "übrige",
    "nicht kategorisiert", "gemischt", "vielfältig", "unterschiedlich", "mannigfaltig", "bunt gemischt"
  ],

  // =====================================================
  // DIENSTLEISTUNGEN
  // =====================================================
  "Creatives": [
    "kreativ", "agentur", "design", "grafikdesign", "webdesign", "kreativbranche", "content creator",
    "kreativagentur", "designagentur", "werbeagentur", "marketingagentur", "branding", "corporate design",
    "logo design", "flyer design", "broschüre", "katalog", "verpackungsdesign", "packaging",
    "fotografie", "videografie", "filmproduktion", "animation", "motion design", "3d design",
    "illustration", "infografik", "social media content", "influencer", "blogger", "youtuber", "content produktion",
    // Social Media & Online Marketing
    "instagram", "tiktok", "facebook", "linkedin", "twitter", "youtube kanal", "social media",
    "follower", "reichweite", "engagement", "kanal", "stadtseite", "city seite", "stadtkanal",
    "online marketing", "digital marketing", "social media marketing", "paid ads", "organisch",
    "account", "post", "reel", "story", "feed", "impressionen", "reichweite", "sichtbarkeit",
    "unternehmen vorstellen", "präsentation", "featured", "sponsoring", "kooperation", "werbung"
  ],
  "Coaching": [
    "coaching", "lifecoach", "business coach", "beratung", "mentoring", "persönlichkeitsentwicklung", "mindset",
    "coach", "trainer", "berater", "consultant", "executive coaching", "führungskräfte coaching", "karrierecoaching",
    "bewerbungscoaching", "jobcoaching", "gründercoaching", "startup beratung", "unternehmensberatung",
    "lebensberatung", "systemisches coaching", "nlp", "hypnose coaching", "motivationscoach", "erfolgscoach",
    "resilienz", "stressmanagement", "work life balance", "zielerreichung", "potenzialentfaltung", "selbstfindung"
  ],
  "Reinigung": [
    "reinigung", "putzfirma", "gebäudereinigung", "cleaning", "sauberkeit", "putzservice",
    "reinigungsfirma", "reinigungsservice", "haushaltsreinigung", "wohnungsreinigung", "büroreinigung",
    "fensterreinigung", "glasreinigung", "teppichreinigung", "polsterreinigung", "grundreinigung",
    "unterhaltsreinigung", "baureinigung", "endreinigung", "umzugsreinigung", "frühjahrsputz",
    "desinfektion", "hygiene", "sauber machen", "putzen", "wischen", "staubsaugen", "hausmeisterservice"
  ],
  "Reperatur / Elektronik": [
    "reparatur", "werkstatt", "instandsetzung", "elektronik reparatur", "handy reparatur",
    "smartphone reparatur", "display reparatur", "akku wechsel", "iphone reparatur", "samsung reparatur",
    "tablet reparatur", "laptop reparatur", "computer reparatur", "pc reparatur", "konsolen reparatur",
    "tv reparatur", "fernseher reparatur", "haushaltsgeräte reparatur", "waschmaschine reparatur",
    "kühlschrank reparatur", "elektroreparatur", "uhrenreparatur", "schmuckreparatur", "schusterservice",
    "schlüsseldienst", "änderungsschneiderei", "reparaturcafe", "repair cafe"
  ],

  // =====================================================
  // MOBILITÄT
  // =====================================================
  "Autohäuser": [
    "autohaus", "autohändler", "neuwagen", "gebrauchtwagen", "autoverkauf", "kfz händler",
    "autoverkauf", "fahrzeughandel", "pkw", "auto kaufen", "auto verkaufen", "inzahlungnahme",
    "probefahrt", "leasing", "finanzierung", "autokredit", "fahrzeugfinanzierung", "autobank",
    "volkswagen", "mercedes", "bmw", "audi", "porsche", "ford", "opel", "toyota", "hyundai",
    "kia", "skoda", "seat", "volvo", "tesla", "elektroauto", "hybrid", "werkstatt auto", "inspektion"
  ],
  "Carsharing": [
    "carsharing", "share now", "sixt share", "mietwagen", "autovermietung", "car rental",
    "auto mieten", "fahrzeug mieten", "kurzeitmiete", "stundenmiete", "tagesmiete", "wochenmiete",
    "miles", "flinkster", "stadtmobil", "cambio", "free floating", "station based", "poolfahrzeug",
    "firmencarsharing", "privat carsharing", "peer to peer", "getaround", "turo", "snappcar",
    "transporter mieten", "lkw mieten", "umzugswagen", "sprinter mieten", "anhänger mieten"
  ],

  // =====================================================
  // IMMOBILIEN & ARBEITEN
  // =====================================================
  "Co-Working": [
    "coworking", "co-working", "shared office", "bürogemeinschaft", "flexible arbeitsplätze", "wework",
    "coworking space", "gemeinschaftsbüro", "arbeitsplatz mieten", "schreibtisch mieten", "desk",
    "hot desk", "dedicated desk", "private office", "team office", "meetingraum mieten", "konferenzraum mieten",
    "business center", "büroservice", "virtual office", "geschäftsadresse", "telefonservice",
    "networking", "community", "freelancer", "startups", "gründer", "remote work", "hybrid work"
  ],
  "Co-Living": [
    "coliving", "co-living", "wohngemeinschaft", "community living", "shared living",
    "gemeinschaftliches wohnen", "wg", "zusammen wohnen", "wohnprojekt", "mehrgenerationenhaus",
    "studentenwohnheim", "serviced apartment", "möbliertes wohnen", "temporary living", "zwischenmiete",
    "expat wohnung", "corporate housing", "furnished apartment", "all inclusive wohnen",
    "community events", "gemeinschaftsküche", "gemeinschaftsraum", "rooftop gemeinschaft", "social living"
  ],
  "Makler": [
    "makler", "immobilien", "wohnung", "haus kaufen", "mieten", "immobilienmakler", "real estate",
    "immobilienbüro", "wohnungsmakler", "hausmakler", "gewerbeimmobilien", "gewerbemakler",
    "wohnung mieten", "wohnung kaufen", "haus mieten", "eigentumswohnung", "mietwohnung", "kaufimmobilie",
    "besichtigung", "exposé", "provision", "courtage", "maklergebühr", "kaufvertrag", "mietvertrag",
    "notar", "grundbuch", "finanzierung immobilie", "baufinanzierung", "hausverwaltung", "property management"
  ],
  "Interior Studios": [
    "interior studio", "raumgestaltung", "innenarchitektur", "einrichtungsberatung",
    "innenarchitekt", "interior designer", "raumdesign", "wohnraumgestaltung", "raumkonzept",
    "farbberatung", "materialberatung", "möbelberatung", "lichtplanung", "beleuchtungskonzept",
    "home staging", "musterwohnung", "einrichtungskonzept", "wohnberatung", "stilberatung wohnen",
    "3d raumplanung", "visualisierung", "moodboard", "stoffmuster", "tapetenmuster", "bodenbeläge"
  ],

  // =====================================================
  // TOURISMUS & HOSPITALITY
  // =====================================================
  "Hotels & Hospitality": [
    "hotel", "unterkunft", "übernachtung", "rezeption", "zimmer", "hospitality", "pension", "hostel",
    "hotelzimmer", "suite", "einzelzimmer", "doppelzimmer", "familienzimmer", "apartment hotel",
    "boutique hotel", "designhotel", "luxushotel", "businesshotel", "stadthotel", "wellness hotel",
    "resort", "all inclusive", "halbpension", "vollpension", "frühstück inklusive", "minibar",
    "roomservice", "zimmerservice", "concierge", "portier", "housekeeping", "check in", "check out"
  ],
  "Tourismus": [
    "tourismus", "reise", "urlaub", "tourist", "sehenswürdigkeit", "ausflug", "tour", "städtereise",
    "stadtführung", "guided tour", "reiseführer", "reiseleiter", "tourguide", "hop on hop off",
    "sightseeing", "besichtigung", "rundgang", "rundfahrt", "bootsfahrt", "schifffahrt", "kreuzfahrt",
    "pauschalreise", "individualreise", "backpacking", "roadtrip", "kurztrip", "wochenendtrip",
    "reisebüro", "reiseagentur", "online reisebüro", "buchungsportal", "flug buchen", "hotel buchen"
  ],

  // =====================================================
  // SONSTIGES
  // =====================================================
  "Straßenumfragen": [
    "umfrage", "straßenumfrage", "befragung", "marktforschung", "feedback",
    "meinungsumfrage", "kundenbefragung", "passantenbefragung", "face to face", "persönliche befragung",
    "fragebogen", "survey", "studie", "erhebung", "datenerhebung", "meinungsforschung", "demoskopie",
    "stichprobe", "proband", "incentive umfrage", "vergütung umfrage",
    "mystery shopping", "testkauf", "produkttest", "geschmackstest", "blindtest"
  ],
  "Soziales": [
    "sozial", "gemeinnützig", "ngo", "verein", "ehrenamt", "wohltätigkeit", "spende", "hilfsorganisation",
    "nonprofit", "non profit", "charity", "stiftung", "förderverein", "sozialarbeit", "sozialpädagogik",
    "jugendhilfe", "altenhilfe", "behindertenhilfe", "obdachlosenhilfe", "flüchtlingshilfe", "integrationshilfe",
    "tafel", "essensausgabe", "kleiderkammer", "sozialkaufhaus", "freiwilligenarbeit", "volunteering",
    "spendensammlung", "fundraising", "benefiz", "gala sozial", "wohltätigkeitsveranstaltung"
  ],
  "Winter / Weihnachten": [
    "winter", "weihnachten", "advent", "adventskalender", "weihnachtsmarkt", "nikolaus", "christkind", "geschenke",
    "weihnachtsgeschenk", "weihnachtsshopping", "weihnachtsdeko", "weihnachtsbaum", "christbaum", "tannenbaum",
    "lichterkette", "weihnachtskugeln", "lametta", "kranz", "adventskranz", "adventskerze", "glühwein",
    "kinderpunsch", "lebkuchen", "spekulatius", "stollen", "plätzchen", "weihnachtsgans", "festessen",
    "bescherung", "heiligabend", "weihnachtsfeiertage", "silvester", "neujahr", "winterzauber", "schnee"
  ],
  "Recruiting": [
    "recruiting", "personal", "bewerbung", "stellenanzeige", "job", "karriere", "hr", "headhunter", "einstellung",
    "personalvermittlung", "arbeitsvermittlung", "jobvermittlung", "talentakquise", "talent acquisition",
    "executive search", "direktansprache", "active sourcing", "bewerbermanagement", "applicant tracking",
    "vorstellungsgespräch", "interview job", "assessment center", "eignungstest", "persönlichkeitstest",
    "onboarding", "einarbeitung", "probezeit", "arbeitsvertrag", "gehaltsverhandlung", "employer branding",
    "karriereseite", "jobbörse", "stepstone", "indeed", "linkedin", "xing", "fachkräftemangel", "talentpool"
  ]
};

// Alle 66 Branchen als Array
const branche_candidates = [
  "Kunst","Kino","Fitness","Fine Dining","Casual Dining","Fast Food","Cafés","Lieferdienste",
  "Bars","Clubs","Lounges","Rooftops","Indoor-Locations","Outdoor-Locations","Events & Shows",
  "Ausstellungen / Abenteuer","Workshops / Kunst","VR / AR","Outdoor Erlebnisse",
  "Saisonale Events (Sommer / Winter)","Museen","Theater","Konzerte","Shows / Austellungen",
  "Einkaufszentren","Premium Fashion","Streetwear","Second Hand / Vintage","Designer",
  "Schmuck & Juweliere","Hair","Nails","Brows & Lashes","Medical Beauty","Spas",
  "Fitnessstudios","Yoga & Pilates","Personal Training","Kampfsport","Ärzte","Kliniken",
  "Augenkliniken","Therapien","Interior","Elektronik","Pflanzen","Lifestyle Stores  I Sport",
  "IT, Apps & Geräte","Diverses","Creatives","Coaching","Reinigung","Reperatur / Elektronik",
  "Autohäuser","Carsharing","Co-Working","Co-Living","Makler","Interior Studios",
  "Hotels & Hospitality","Straßenumfragen","Soziales","Tourismus","Winter / Weihnachten","Recruiting"
];

// Gastronomie-Branchen (für spezielle Behandlung)
const GASTRO_BRANCHES = [
  "Fine Dining", "Casual Dining", "Fast Food", "Cafés", "Lieferdienste", 
  "Bars", "Clubs", "Lounges", "Rooftops"
];

// -----------------------------
// BRANCHENFILTER LOGIK
// -----------------------------
function detectBranche(combinedText) {
  const text = combinedText.toLowerCase();
  const scores = {};
  
  // Initialisiere alle Branchen mit Score 0
  for (const branche of Object.keys(BRANCHE_KEYWORDS)) {
    scores[branche] = 0;
  }
  
  // Zähle Keyword-Matches für jede Branche
  for (const [branche, keywords] of Object.entries(BRANCHE_KEYWORDS)) {
    for (const keyword of keywords) {
      // Exakte Wortgrenze-Prüfung für bessere Genauigkeit
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      const matches = (text.match(regex) || []).length;
      if (matches > 0) {
        // Längere Keywords bekommen höheres Gewicht (spezifischer)
        const weight = keyword.split(' ').length;
        scores[branche] += matches * weight;
      }
    }
  }
  
  // Sortiere nach Score
  const sortedBranches = Object.entries(scores)
    .filter(([_, score]) => score > 0)
    .sort((a, b) => b[1] - a[1]);
  
  // Wenn keine Branche erkannt wurde -> Fallback "Diverses"
  if (sortedBranches.length === 0) {
    return {
      primary: "Diverses",
      fallbacks: ["Straßenumfragen", "Soziales", "Events & Shows"],
      confidence: "none",
      scores: {}
    };
  }
  
  const topBranche = sortedBranches[0][0];
  const topScore = sortedBranches[0][1];
  
  // Bestimme Confidence Level
  let confidence = "low";
  if (topScore >= 3) confidence = "medium";
  if (topScore >= 5) confidence = "high";
  
  // Gastronomie nur bei hoher Confidence priorisieren
  const isGastro = GASTRO_BRANCHES.includes(topBranche);
  if (isGastro && confidence === "low") {
    // Suche nach nicht-gastronomischen Alternativen mit gleichem oder höherem Score
    const nonGastroAlternatives = sortedBranches.filter(
      ([branche, score]) => !GASTRO_BRANCHES.includes(branche) && score >= topScore * 0.7
    );
    
    if (nonGastroAlternatives.length > 0) {
      // Bevorzuge nicht-gastronomische Branche wenn Score ähnlich
      return {
        primary: nonGastroAlternatives[0][0],
        fallbacks: sortedBranches.slice(0, 5).map(([b, _]) => b).filter(b => b !== nonGastroAlternatives[0][0]),
        confidence: confidence,
        scores: Object.fromEntries(sortedBranches.slice(0, 10))
      };
    }
  }
  
  // Normale Rückgabe: Top Branche + Fallbacks
  const fallbacks = sortedBranches
    .slice(1, 5)
    .map(([branche, _]) => branche);
  
  // Füge verwandte Branchen als Fallbacks hinzu wenn nötig
  if (fallbacks.length < 3) {
    fallbacks.push("Diverses", "Events & Shows");
  }
  
  return {
    primary: topBranche,
    fallbacks: fallbacks.slice(0, 4),
    confidence: confidence,
    scores: Object.fromEntries(sortedBranches.slice(0, 10))
  };
}

// -----------------------------
// BRANCHENANALYSE AUSFÜHREN
// -----------------------------
// WICHTIG: Nur Kundenseite (THEM + Memory) für Branchenerkennung verwenden.
// Wir sind selbst eine Marketing-/Media-Agentur → unsere Keywords (instagram,
// agentur, social media, follower) würden sonst bei JEDEM Gespräch "Creatives"
// triggern, obwohl der Kunde z.B. aus Fitness, Konzerte etc. kommt.
const combinedTxt = `${liveYouText} ${liveThemText} ${memory_context_text} ${memory_topics.join(" ")}`;
const brancheDetectionTxt = `${liveThemText} ${memory_context_text} ${memory_topics.join(" ")}`;
const branchenResult = detectBranche(brancheDetectionTxt);

const reference_branche_primary = branchenResult.primary;
const reference_branche_fallbacks = branchenResult.fallbacks;
const branche_confidence = branchenResult.confidence;
const branche_scores = branchenResult.scores;

// -----------------------------
// Kampagnen-Typ (separiert von Branchen!)
// -----------------------------
const combinedTxtLower = combinedTxt.toLowerCase();
let campaign_type = "standard";
if (combinedTxtLower.includes("advent") || combinedTxtLower.includes("adventskalender") || 
    combinedTxtLower.includes("weihnacht") || combinedTxtLower.includes("winter")) {
  campaign_type = "adventskalender";
}

// -----------------------------
// Reference Query (dynamisch basierend auf erkannter Branche)
// -----------------------------
const intentHints = [
  reference_branche_primary,
  ...reference_branche_fallbacks.slice(0, 2)
];

// Keyword-Extraktion: Stop-Words filtern für saubere Pinecone-Queries
const STOP_WORDS_DE = new Set([
  "ich","du","er","sie","es","wir","ihr","und","oder","aber","mit","auf","von","für","bei",
  "das","die","der","den","dem","des","ein","eine","einen","einem","einer","eines",
  "ist","sind","war","waren","hat","haben","hatte","hatten","wird","werden","wurde","worden",
  "kann","können","möchte","müssen","soll","darf","muss","habe","hast",
  "ja","nein","nicht","kein","keine","keinen","keinem","keiner","keines",
  "auch","noch","schon","mal","dann","da","hier","dort","wie","was","wer","wo","wann","warum",
  "okay","ok","so","halt","eigentlich","grundsätzlich","einfach","ganz","sehr","eben","doch",
  "nur","jetzt","danach","wenn","als","dass","ob","weil","damit","wobei","beim","immer","nie",
  "tschüss","hallo","hi","hey","alles","klar","guten","tag","morgen","abend","bitte","danke",
  "diesem","dieser","dieses","diesen","welche","welcher","welches","welchen",
  "ihnen","ihrem","ihrer","ihres","ihren","seine","seiner","seinem","seinen",
  "meine","meiner","meinem","meinen","deiner","deinem","deinen","deine",
  "denn","obwohl","jedoch","trotzdem","daher","deshalb","also","hätte","wäre","müsste",
  "könnte","sollte","dürfte","geworden","bekommen","einmal","muesse","müsste","nochmal",
  "gerne","genau","richtig","falsch","wahrscheinlich","eigentlich","vielleicht","natürlich"
]);

function extractKeywords(text, maxWords) {
  return String(text || "")
    .replace(/[^a-züäöß\s]/gi, " ")
    .split(/\s+/)
    .filter(w => {
      const wl = w.toLowerCase();
      return w.length > 3 && !STOP_WORDS_DE.has(wl);
    })
    .slice(0, maxWords)
    .join(" ");
}

const liveKeywordsYou  = extractKeywords(liveYouText, 10);
const liveKeywordsThem = extractKeywords(liveThemText, 8);
const topicKeywords    = memory_topics.slice(0, 3).join(" ");

const reference_query = [
  intentHints.join(" "),
  liveKeywordsThem,
  liveKeywordsYou,
  topicKeywords
].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 280);

const ref_context = [
  `BRANCHE: ${reference_branche_primary}`,
  `FALLBACKS: ${reference_branche_fallbacks.join(", ")}`,
  `CONFIDENCE: ${branche_confidence}`,
  `TOPICS: ${memory_topics.slice(0,4).join(", ")}`,
  `LIVE THEM: ${clip(liveThemText, 180)}`,
  `LIVE YOU: ${clip(liveYouText, 220)}`,
  `MEMORY: ${clip(memory_context_text, 260)}`
].join("\n").slice(0, 900);

// Filter Kandidaten basierend auf erkannter Branche
const reference_filter_candidates = [
  reference_branche_primary,
  ...reference_branche_fallbacks
].filter((v, i, a) => a.indexOf(v) === i); // Deduplizieren

const branche_hint_text = [
  liveYouText.slice(0,140),
  liveThemText.slice(0,140),
  memory_context_text.slice(0,180)
].filter(Boolean).join(" | ");

// -----------------------------
// OUTPUT
// -----------------------------
return [{
  json: {
    session_id,
    lead_id,
    generated_at: new Date().toISOString(),
    new_run: true,

    // References: Query + Filter Kandidaten
    reference_query,
    ref_context,
    reference_filter_candidates,

    // Branche für Filter (VERBESSERT)
    branche_candidates,
    branche_hint_text,
    branche_confidence,
    branche_scores,

    // Branchen Fallbacks
    campaign_type,
    reference_branche_primary,
    reference_branche_fallbacks,

    // Agent Inputs
    live_context_text,
    memory_context_text,
    memory_topics,

    // Words
    words_you,
    words_them,

    // WPM stable + burst
    wpm_you,
    wpm_them,
    wpm_burst_you,
    wpm_burst_them,

    // pacing
    pacing_you,
    pacing_them,

    // Backwards compat
    current_wpm: wpm_you,
    pacing_status: pacing_you,

    // Talk ratio
    talk_ratio_pct_you,
    talk_ratio_pct_them,

    // Memory scoring
    dominates,
    avg_talk_ratio_you: avg_you,

    // Warnings
    pacing_warning,
    talk_ratio_warning,
    burst_warning,

    // Durations
    duration_sec,
    stable_duration_sec: stableDurationSec,
    burst_duration_sec: burstDurationSec
  }
}];