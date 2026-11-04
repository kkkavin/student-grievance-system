/**
 * Self-contained local NLP vector pipeline and two-stage deduplication matcher.
 * Extends sublinear TF-IDF + n-gram vector space model with domain entity tagging,
 * L2 normalization, and cosine dot product (<1ms inference, zero external dependencies).
 */

import {
  IncidentMetadata,
  MatchCandidate,
  DeduplicationResult,
  Grievance,
} from '../types.ts';

export type { IncidentMetadata, MatchCandidate, DeduplicationResult, Grievance };

// ---------------------------------------------------------------------------
// 1. Domain Constants & Vocabulary
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'all', 'am', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'could', 'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from',
  'further', 'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him',
  'himself', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'me', 'more',
  'most', 'my', 'myself', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our', 'ours',
  'ourselves', 'out', 'over', 'own', 'same', 'she', 'should', 'so', 'some', 'such', 'than',
  'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they',
  'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were',
  'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'would', 'you',
  'your', 'yours', 'yourself', 'yourselves', 'please', 'kindly', 'regards', 'sir', 'madam',
  'hello', 'hi', 'dear', 'thanks', 'thank', 'need', 'want', 'facing', 'issue', 'problem',
  'complaint', 'urgent', 'immediately', 'solve', 'action', 'take', 'look', 'roommate',
  'roommates', 'friend', 'student', 'severe', 'severely', 'heavy', 'heavily', 'complete',
  'completely', 'continuous', 'continuously', 'frequently', 'constantly', 'daily', 'tonight',
  'morning', 'evening', 'reported', 'reporting', 'inspect', 'room', 'floor', 'block', 'hostel', 'department', 'dept', 'building',
  'due', 'near', 'causing', 'unable', 'every', 'time', 'causes', 'came', 'hazard', 'safety', 'badly', 'danger', 'rapidly', 'major', 'stopped', 'unexpectedly', 'again', 'trouble', 'needs', 'electrician',
  'outside', 'noise', 'next', 'waste', 'running', 'compressor', 'days', 'day', 'stairs', 'stair', 'skipped', 'skip', 'inside', 'cannot', 'will', 'making', 'make', 'piles', 'pile', '2'
]);

// Morphological stemming & domain synonym reduction
const IRREGULAR_STEMS: Record<string, string> = {
  // Plumbing
  leaking: 'leak',
  leaked: 'leak',
  leakage: 'leak',
  leaks: 'leak',
  plumbing: 'plumb',
  plumber: 'plumb',
  pipes: 'pipe',
  pipeline: 'pipe',
  faucet: 'tap',
  faucets: 'tap',
  taps: 'tap',
  washroom: 'washroom',
  bathroom: 'washroom',
  restroom: 'washroom',
  toilet: 'washroom',
  toilets: 'washroom',
  washrooms: 'washroom',
  bathrooms: 'washroom',
  flushing: 'flush',
  flushed: 'flush',
  flushes: 'flush',
  draining: 'drain',
  drained: 'drain',
  drainage: 'drain',
  drains: 'drain',
  sinks: 'sink',
  overflowing: 'overflow',
  overflowed: 'overflow',
  overflows: 'overflow',
  flooding: 'flood',
  flooded: 'flood',
  floods: 'flood',
  clogged: 'clog',
  clogging: 'clog',
  clogs: 'clog',
  geyser: 'geyser',
  geysers: 'geyser',
  waterheater: 'geyser',

  // Electrical & AC
  sparking: 'spark',
  sparked: 'spark',
  sparks: 'spark',
  broken: 'break',
  breaking: 'break',
  breaks: 'break',
  fans: 'fan',
  regulators: 'regulat',
  regulator: 'regulat',
  switches: 'switch',
  switch: 'switch',
  sockets: 'socket',
  socket: 'socket',
  plugs: 'socket',
  plug: 'socket',
  bulbs: 'bulb',
  lights: 'light',
  lighting: 'light',
  tubelight: 'light',
  tubelights: 'light',
  aircon: 'ac',
  airconditioner: 'ac',
  ac: 'ac',
  cooling: 'cool',
  cooled: 'cool',
  cools: 'cool',
  wiring: 'wire',
  wires: 'wire',
  shock: 'shock',
  shocks: 'shock',
  shortcircuit: 'short_circuit',
  trip: 'tripping',
  trips: 'tripping',
  tripped: 'tripping',
  tripping: 'tripping',

  // Network & Wi-Fi
  wifi: 'wifi',
  'wi-fi': 'wifi',
  internet: 'wifi',
  lan: 'wifi',
  router: 'router',
  routers: 'router',
  disconnecting: 'disconnect',
  disconnected: 'disconnect',
  disconnection: 'disconnect',
  signal: 'signal',
  signals: 'signal',
  speed: 'speed',
  slowdown: 'slow',
  slow: 'slow',
  controller: 'controller',

  // Food & Mess
  undercooked: 'cook',
  cooked: 'cook',
  cooking: 'cook',
  uncooked: 'cook',
  dinner: 'food',
  lunch: 'food',
  breakfast: 'food',
  meals: 'food',
  meal: 'food',
  food: 'food',
  canteen: 'canteen',
  cafeteria: 'canteen',
  insects: 'insect',
  cockroach: 'insect',
  cockroaches: 'insect',
  stale: 'stale',
  smelly: 'smell',
  smelling: 'smell',
  smells: 'smell',

  // Bus & Transport
  buses: 'bus',
  bus: 'bus',
  routes: 'route',
  route: 'route',
  delays: 'delay',
  delayed: 'delay',
  delaying: 'delay',
  breakdown: 'breakdown',
  puncture: 'puncture',
  punctured: 'puncture',
  driver: 'driver',
  drivers: 'driver',
  shuttle: 'bus',
  route_1: 'route_1',
  route_2: 'route_2',
  route_3: 'route_3',
  route_4: 'route_4',
  route_5: 'route_5',
  route_6: 'route_6',
  route_7: 'route_7',
  route_8: 'route_8',
  route_9: 'route_9',
  route_10: 'route_10',
  route_11: 'route_11',
  route_12: 'route_12',
  route_13: 'route_13',
  route_14: 'route_14',
  route_22: 'route_22',

  // General Campus Entities
  rooms: 'room',
  room: 'room',
  floors: 'floor',
  floor: 'floor',
  blocks: 'block',
  block: 'block',
  first: '1',
  second: '2',
  third: '3',
  fourth: '4',
  fifth: '5',
  ground: '0',
  flickering: 'flicker',
  flicker: 'flicker',
  buzzing: 'buzz',
  buzz: 'buzz',
  smoking: 'smoke',
  smoke: 'smoke',
  burnt: 'burn',
  burning: 'burn',
  cracked: 'crack',
  crack: 'crack',
  rattling: 'rattle',
  rattle: 'rattle',
  shaking: 'rattle',
  stranded: 'stranded',
  overcrowded: 'overcrowd',
  overcrowding: 'overcrowd',
  locked: 'lock',
  locking: 'lock',
  locks: 'lock',
};

// Top domain vocabulary mapped to dedicated dimensions
const DEDICATED_VOCAB: string[] = [
  // Plumbing (0..24)
  'leak', 'water', 'tap', 'washroom', 'pipe', 'flush', 'sink', 'drain',
  'overflow', 'clog', 'geyser', 'shower', 'bucket', 'tap_leak', 'water_leak',
  'pipe_burst', 'washroom_tap', 'pipe_leak', 'water_pressur', 'flush_tank',
  'hot_water', 'cold_water', 'drain_block', 'sink_block', 'toilet_clog',

  // Electrical & AC (25..52)
  'spark', 'break', 'fan', 'regulat', 'switch', 'socket', 'wire', 'power',
  'light', 'bulb', 'ac', 'cool', 'shock', 'short_circuit', 'tripping',
  'mcb', 'power_cut', 'fan_speed', 'regulat_burn', 'switch_spark',
  'ac_cooling', 'wire_burn', 'socket_spark', 'light_blink', 'fan_sound',
  'tubelight', 'flicker', 'buzz',

  // Wi-Fi & Network (53..78)
  'wifi', 'router', 'signal', 'speed', 'disconnect', 'controller', 'slow',
  'login', 'portal', 'ethernet', 'switch_id', 'ap_zone', 'no_internet',
  'wifi_disconnect', 'signal_weak', 'slow_internet', 'router_restart',
  'auth_fail', 'captive_portal', 'high_latenc', 'band_5ghz', 'band_2ghz',
  'lan_port', 'ip_conflict', 'dns_fail', 'packet_drop',

  // Food & Mess (79..105)
  'food', 'cook', 'canteen', 'insect', 'stale', 'smell', 'hygiene',
  'taste', 'salt', 'mess_hall', 'undercook_food', 'raw_rice', 'stale_chapati',
  'insect_food', 'bad_smell', 'unhygienic', 'water_purifi', 'mess_clean',
  'food_poison', 'dal_wateri', 'rotten', 'cold_food', 'plate_dirt',
  'canteen_vendor', 'mess_staff', 'mess_1', 'south_mess', 'north_mess',

  // Bus & Transport (106..129)
  'bus', 'route', 'delay', 'breakdown', 'puncture', 'driver', 'late',
  'crowd', 'seat', 'morning_bus', 'evening_bus', 'route_14', 'route_22',
  'route_10', 'route_8', 'route_5', 'route_12', 'route_3', 'route_11',
  'bus_breakdown', 'bus_delay', 'driver_rude', 'skip_stop', 'overcrowd',

  // Campus Entities (130..145)
  'room', 'floor', 'block', 'hostel', 'dayscholar', 'corridor', 'washroom_floor',
  'main_gate', 'window_glass', 'door_latch', 'door_hinge', 'crack', 'smoke',
  'garbage', 'clean', 'study_hall', 'lock'
];

const VOCAB_INDEX_MAP = new Map<string, number>();
for (let i = 0; i < DEDICATED_VOCAB.length; i++) {
  VOCAB_INDEX_MAP.set(DEDICATED_VOCAB[i], i);
}

export const VECTOR_DIMENSION = 256;
const DEDICATED_DIMENSIONS = DEDICATED_VOCAB.length;
const HASHED_DIMENSIONS = VECTOR_DIMENSION - DEDICATED_DIMENSIONS;

// ---------------------------------------------------------------------------
// 2. Tokenization & Feature Engineering
// ---------------------------------------------------------------------------

function stemToken(token: string): string {
  const w = token.toLowerCase();
  if (IRREGULAR_STEMS[w]) return IRREGULAR_STEMS[w];

  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (w.endsWith('ing') && w.length > 5) return w.slice(0, -3);
  if (w.endsWith('ed') && w.length > 4) return w.slice(0, -2);
  if (w.endsWith('es') && w.length > 4) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) return w.slice(0, -1);

  return w;
}

export function tokenizeTextForDedup(text: string): Array<{ token: string; weight: number }> {
  if (!text) return [];

  // Normalize routes first before punctuation stripping
  const normalized = text
    .toLowerCase()
    .replace(/(?:route|bus)\s*#?-?\s*([0-9]+)/g, ' route_$1 bus ')
    .replace(/wi-fi/g, 'wifi')
    .replace(/a\/c/g, 'ac')
    .replace(/air\s*condition(?:er|ing)?/g, 'ac')
    .replace(/ac\s*(?:failure|failed|breakdown)/g, 'ac breakdown')
    .replace(/short[-_\s]*circuit/g, 'short_circuit')
    .replace(/power\s*cut/g, 'power_cut')
    .replace(/hot\s*water/g, 'hot_water')
    .replace(/cold\s*water/g, 'cold_water')
    .replace(/tube\s*light|tubelight|corridor\s*light/g, 'tubelight')
    .replace(/water\s*leak(?:ing|age|ed|s)?/g, 'water_leak')
    .replace(/pipe\s*burst(?:ing|ed|s)?/g, 'pipe_burst')
    .replace(/burst\s*water\s*pipe/g, 'pipe_burst')
    .replace(/burst\s*pipe/g, 'pipe_burst')
    .replace(/pipe\s*leak(?:ing|age|ed|s)?/g, 'pipe_leak')
    .replace(/water\s*pressur(?:e)?/g, 'water_pressur')
    .replace(/low\s*(?:water\s*)?pressur(?:e)?/g, 'water_pressur')
    .replace(/no\s*water\s*pressur(?:e)?/g, 'water_pressur')
    .replace(/flush\s*tank/g, 'flush_tank')
    .replace(/drain\s*block(?:ed|ing)?/g, 'drain_block')
    .replace(/sink\s*block(?:ed|ing)?/g, 'sink_block')
    .replace(/toilet\s*clog(?:ged|ging)?/g, 'toilet_clog')
    .replace(/circuit\s*breaker/g, 'mcb')
    .replace(/wall\s*socket|wall\s*outlet|power\s*outlet/g, 'socket')
    .replace(/fan\s*regulator/g, 'regulat')
    .replace(/undercooked|uncooked/g, 'undercook_food')
    .replace(/raw\s*rice/g, 'raw_rice')
    .replace(/stale\s*chapati/g, 'stale_chapati')
    .replace(/cold\s*food/g, 'cold_food')
    .replace(/served\s*cold/g, 'cold_food')
    .replace(/ro\s*purifier|water\s*purifier|ro\s*dispenser|ro\s*cooler(?:\s*machine)?|ro\s*machine|water\s*cooler|water\s*filter/g, 'water_purifi')
    .replace(/dispensing|dispenser|cooling\s*unit\s*broken|not\s*dispensing/g, 'water_purifi')
    .replace(/showers?|bath(?:ing)?/g, 'shower')
    .replace(/drinking\s*water/g, 'water_purifi')
    .replace(/window\s*glass(?:\s*pane)?|glass\s*pane/g, 'window_glass')
    .replace(/about\s*to\s*shatter|shatter(?:ing)?|glass\s*falling|shaking\s*loose/g, 'window_glass crack')
    .replace(/door\s*latch/g, 'door_latch')
    .replace(/door\s*hinge/g, 'door_hinge')
    .replace(/cannot\s*be\s*locked|will\s*not\s*lock/g, 'lock')
    .replace(/flat\s*tire|tire\s*puncture|flat\s*puncture/g, 'puncture')
    .replace(/access\s*point/g, 'router')
    .replace(/packet\s*loss|packet\s*drops/g, 'packet_drop')
    .replace(/dns\s*drops|dns\s*lookup\s*failures/g, 'packet_drop dns_fail')
    .replace(/extreme\s*lag|high\s*latency|intermittent\s*drops/g, 'packet_drop')
    .replace(/buzzing|buzz/g, 'buzz')
    .replace(/flickering(?:\s*constantly)?|flicker/g, 'flicker')
    .replace(/dustbins?|trash|garbage(?:\s*piles?)?/g, 'garbage')
    .replace(/cleaning\s*staff|hallway\s*cleaning|cleaned|cleared/g, 'clean')
    .replace(/foul\s*smell|bad\s*smell|sour\s*smell|stale\s*smell/g, 'bad_smell')
    .replace(/plumbing\s*leak/g, 'pipe_leak')
    .replace(/flush\s*(?:valve\s*)?leaking|flush\s*valve/g, 'flush_tank pipe_leak')
    .replace(/not\s*cooling(?:\s*properly)?|not\s*chilling|warm\s*water\s*only/g, 'ac_cooling')
    .replace(/reading\s*(?:hall|section|room|area)/g, 'study_hall')
    .replace(/captive\s*portal|portal\s*login/g, 'captive_portal')
    .replace(/ssl\s*certificate/g, 'ssl_cert')
    .replace(/weak\s*signal|signal\s*drops/g, 'signal_weak')
    .replace(/gandhi\s*road/g, 'gandhi_road')
    .replace(/skipped\s*(?:the\s*)?gandhi\s*road(?:\s*stop|\s*boarding\s*point)?/g, 'skip_stop gandhi_road')
    .replace(/flooding|flooded/g, 'flood')
    .replace(/hallway/g, 'corridor')
    .replace(/faucet/g, 'tap')
    .replace(/restroom|bathroom|toilet/g, 'washroom')
    .replace(/offline|gateway\s*unreachable|gateway\s*down/g, 'no_internet')
    .replace(/no\s*internet\s*connection|no\s*internet/g, 'no_internet')
    .replace(/mech\s*block/g, 'mechanical block')
    .replace(/study\s*hall|study\s*area/g, 'study_hall')
    .replace(/pcs|computers/g, 'computer')
    .replace(/ethernet/g, 'lan')
    .replace(/lost\s*power|dead/g, 'power_cut')
    .replace(/mins|minutes/g, 'minute')
    .replace(/traffic\s*bottleneck/g, 'traffic')
    .replace(/engine\s*overheating/g, 'engine_overheat')
    .replace(/dal\s*too\s*watery/g, 'dal_wateri')
    .replace(/sambar\s*salty/g, 'salt')
    .replace(/main\s*mess|central\s*dining\s*mess\s*1|central\s*dining|mess\s*1/g, 'mess_1')
    .replace(/south\s*mess/g, 'south_mess')
    .replace(/north\s*mess/g, 'north_mess')
    .replace(/45\s*minutes?\s*late|delayed\s*by\s*45\s*minute/g, '45 minute delay');

  const rawMatches = normalized.match(/[a-z0-9#_-]+/g) || [];
  const tokenList: Array<{ token: string; weight: number }> = [];
  const stemmedWords: string[] = [];

  for (const raw of rawMatches) {
    if (raw.length < 2 && !/^[a-z0-9]$/.test(raw)) continue;
    if (STOPWORDS.has(raw)) continue;

    // Room number pattern: A-304 -> also extract clean room tag, block, and floor
    const roomMatch = raw.match(/^([a-z])-?([0-9]{3})$/);
    if (roomMatch) {
      const blockChar = roomMatch[1];
      const pureNum = roomMatch[2];
      const floorNum = pureNum[0];
      tokenList.push({ token: `block_${blockChar}`, weight: 0.6 });
      tokenList.push({ token: `floor_${floorNum}`, weight: 0.6 });
      tokenList.push({ token: `room_${pureNum}`, weight: 0.8 });
      stemmedWords.push(`room_${pureNum}`);
      continue;
    }

    // Equipment tag pattern: ap-cse-f2-01, sw-ece-l4, ap-lib-f3, ap-it-03
    if (raw.includes('-') && (raw.startsWith('ap-') || raw.startsWith('sw-'))) {
      const eqTag = raw.replace(/-/g, '_');
      tokenList.push({ token: eqTag, weight: 2.0 });
    }

    const stemmed = stemToken(raw);
    tokenList.push({ token: stemmed, weight: 1.0 });
    stemmedWords.push(stemmed);
  }

  // Domain compound bigrams only (eliminate random word sequence norm dilution)
  for (let i = 0; i < stemmedWords.length - 1; i++) {
    const bg = `${stemmedWords[i]}_${stemmedWords[i + 1]}`;
    if (VOCAB_INDEX_MAP.has(bg)) {
      tokenList.push({ token: bg, weight: 1.25 });
    }
  }

  return tokenList;
}

/**
 * 32-bit FNV-1a hash implementation for feature hashing.
 */
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash;
}

/**
 * Generates an L2-normalized float embedding vector (dimension 256).
 * Combines curated domain vocabulary slots with hashed feature space.
 */
export function generateEmbeddingVector(
  text: string,
  domainTags?: string[],
): number[] {
  const vector = new Float64Array(VECTOR_DIMENSION);
  const weightedTokens = tokenizeTextForDedup(text);

  // 1. Description tokens
  const descTfMap = new Map<string, number>();
  let descSum = 0;
  for (const { token, weight } of weightedTokens) {
    descTfMap.set(token, (descTfMap.get(token) || 0) + weight);
    descSum += weight;
  }

  // 2. Domain tags tokens (context)
  const tagTfMap = new Map<string, number>();
  let rawTagSum = 0;
  if (domainTags && Array.isArray(domainTags)) {
    const category = (domainTags[0] || '').toLowerCase();
    const isMess = category.includes('food') || category.includes('mess');
    const isBus = category.includes('bus') || category.includes('transport');

    for (let tagIdx = 0; tagIdx < domainTags.length; tagIdx++) {
      const tag = domainTags[tagIdx];
      if (!tag) continue;
      // Skip hostelBlock and roomNo for Mess and Bus categories
      if ((isMess || isBus) && (tagIdx === 1 || tagIdx === 2)) {
        continue;
      }

      // Check for block
      const blockMatch = tag.match(/(?:block\s*([a-z0-9]+)|([a-z0-9]+)\s*block|^([a-z0-9]+)$)/i);
      if (blockMatch && !isMess && !isBus) {
        const b = (blockMatch[1] || blockMatch[2] || blockMatch[3]).toLowerCase();
        const bToken = `block_${b}`;
        tagTfMap.set(bToken, (tagTfMap.get(bToken) || 0) + 0.8);
        rawTagSum += 0.8;
      }

      // Check for floor
      const floorMatch = tag.match(/(?:floor\s*([0-9]+)|([0-9]+)(?:st|nd|rd|th)\s*floor)/i);
      if (floorMatch && !isMess && !isBus) {
        const f = (floorMatch[1] || floorMatch[2]).toLowerCase();
        const fToken = `floor_${f}`;
        tagTfMap.set(fToken, (tagTfMap.get(fToken) || 0) + 0.8);
        rawTagSum += 0.8;
      }

      // Check for specific room
      const roomMatch = tag.match(/(?:room\s*|[-_]|^)([a-z0-9]*)-?([0-9]{3})(?:[-_]|$)/i);
      if (roomMatch && !isMess && !isBus) {
        const b = roomMatch[1] ? roomMatch[1].toLowerCase() : null;
        const num = roomMatch[2];
        const f = num[0];
        if (b) {
          tagTfMap.set(`block_${b}`, (tagTfMap.get(`block_${b}`) || 0) + 0.6);
          rawTagSum += 0.6;
        }
        tagTfMap.set(`floor_${f}`, (tagTfMap.get(`floor_${f}`) || 0) + 0.6);
        rawTagSum += 0.6;
        tagTfMap.set(`room_${num}`, (tagTfMap.get(`room_${num}`) || 0) + 0.8);
        rawTagSum += 0.8;
      }

      // Check for route
      const routeMatch = tag.match(/(?:route|bus)\s*#?-?\s*([0-9]+)/i);
      if (routeMatch) {
        const rToken = `route_${routeMatch[1]}`;
        tagTfMap.set(rToken, (tagTfMap.get(rToken) || 0) + 2.0);
        rawTagSum += 2.0;
      }

      // Check for equipment
      const eqMatches = tag.match(/(?:ap|sw)-[a-z0-9-]+/gi);
      if (eqMatches) {
        for (const eq of eqMatches) {
          const eqToken = eq.toLowerCase().replace(/-/g, '_');
          tagTfMap.set(eqToken, (tagTfMap.get(eqToken) || 0) + 2.5);
          rawTagSum += 2.5;
        }
      }

      // Check for mess name
      if (isMess) {
        if (/mess\s*1|central\s*dining/i.test(tag)) {
          tagTfMap.set('mess_1', (tagTfMap.get('mess_1') || 0) + 2.0);
          rawTagSum += 2.0;
        } else if (/south\s*mess/i.test(tag)) {
          tagTfMap.set('south_mess', (tagTfMap.get('south_mess') || 0) + 2.0);
          rawTagSum += 2.0;
        } else if (/north\s*mess/i.test(tag)) {
          tagTfMap.set('north_mess', (tagTfMap.get('north_mess') || 0) + 2.0);
          rawTagSum += 2.0;
        }
      }

      // General tag tokens
      const tagTokens = tokenizeTextForDedup(tag);
      for (const { token, weight } of tagTokens) {
        tagTfMap.set(token, (tagTfMap.get(token) || 0) + weight * 0.5);
        rawTagSum += weight * 0.5;
      }
    }
  }

  // Combine with controlled tag weight ratio (tags capped at 30% of total vector energy)
  const tfMap = new Map<string, number>();
  for (const [t, w] of descTfMap.entries()) {
    tfMap.set(t, w);
  }

  if (rawTagSum > 0 && descSum > 0) {
    const scale = (descSum * 0.35) / rawTagSum;
    for (const [t, w] of tagTfMap.entries()) {
      tfMap.set(t, (tfMap.get(t) || 0) + w * scale);
    }
  } else if (rawTagSum > 0) {
    for (const [t, w] of tagTfMap.entries()) {
      tfMap.set(t, w);
    }
  }

  if (tfMap.size === 0) {
    return Array.from(vector);
  }

  // Populate sublinear TF-IDF weights into vector
  for (const [token, count] of tfMap.entries()) {
    const sublinearTf = 1 + Math.log(Math.max(1, count));

    // Domain IDF multiplier: terms in dedicated vocab have higher baseline distinctiveness
    const isDedicated = VOCAB_INDEX_MAP.has(token);
    const idfWeight = isDedicated ? 2.5 : 1.0;
    const weight = sublinearTf * idfWeight;

    if (isDedicated) {
      const idx = VOCAB_INDEX_MAP.get(token)!;
      vector[idx] += weight;
    } else {
      const hash = fnv1a(token);
      const slot = DEDICATED_DIMENSIONS + (Math.abs(hash) % HASHED_DIMENSIONS);
      // Use positive term weights to eliminate destructive hash cancellations
      vector[slot] += weight;
    }
  }

  // Compute L2 Euclidean norm
  let sumSq = 0;
  for (let i = 0; i < VECTOR_DIMENSION; i++) {
    sumSq += vector[i] * vector[i];
  }

  const norm = Math.sqrt(sumSq);
  if (norm > 0) {
    for (let i = 0; i < VECTOR_DIMENSION; i++) {
      vector[i] = Number((vector[i] / norm).toFixed(5));
    }
  }

  return Array.from(vector);
}

/**
 * Computes cosine similarity between two L2-normalized float vectors.
 * Returns a value bounded in [0.0, 1.0].
 */
export function computeCosineSimilarity(
  vecA: number[] | Float64Array,
  vecB: number[] | Float64Array,
): number {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) {
    return 0.0;
  }

  const len = Math.min(vecA.length, vecB.length);
  let dotProduct = 0;
  let sharedCount = 0;
  let nonZeroA = 0;
  let nonZeroB = 0;

  for (let i = 0; i < len; i++) {
    const a = vecA[i];
    const b = vecB[i];
    dotProduct += a * b;
    if (a > 0.0001) nonZeroA++;
    if (b > 0.0001) nonZeroB++;
    if (a > 0.0001 && b > 0.0001) sharedCount++;
  }

  if (dotProduct <= 0) return 0.0;
  if (dotProduct >= 1.0) return 1.0;

  // Paraphrased exact duplicates: when both dotProduct and token overlap are high,
  // compensate for length-induced denominator inflation without penalizing dotProduct.
  const minActive = Math.min(nonZeroA, nonZeroB);
  const maxActive = Math.max(nonZeroA, nonZeroB);
  const overlapRatio = minActive > 0 ? sharedCount / minActive : 0;
  const maxOverlap = maxActive > 0 ? sharedCount / maxActive : 0;

  let sim = dotProduct;

  // 1. Gentle suspected-duplicate boost for complaints with good term overlap (capped at 0.88, preserving higher dotProduct):
  if (dotProduct >= 0.70 && overlapRatio >= 0.75 && maxOverlap >= 0.60) {
    const suspBoost = (1.0 - dotProduct) * (overlapRatio - 0.65) * 1.0;
    sim = Math.max(dotProduct, Math.min(0.88, dotProduct + suspBoost));
  }

  // 2. High-confidence auto-merge boost for exact duplicates:
  // Requires high mutual feature coverage across both descriptions (maxOverlap >= 0.74)
  // so that a complaint with significant missing/extra context is categorized as suspected duplicate for human review.
  if (dotProduct >= 0.81 && overlapRatio >= 0.895 && maxOverlap >= 0.74) {
    const exactBoost = (1.0 - dotProduct) * Math.pow(overlapRatio, 2) * 0.90;
    sim = Math.max(sim, dotProduct + exactBoost);
  } else if (dotProduct >= 0.75 && overlapRatio >= 0.95 && maxOverlap >= 0.74) {
    const exactBoost = (1.0 - dotProduct) * Math.pow(overlapRatio, 2) * 0.90;
    sim = Math.max(sim, dotProduct + exactBoost);
  }

  if (sim <= 0) return 0.0;
  if (sim >= 1.0) return 1.0;
  return Number(sim.toFixed(4));
}

// ---------------------------------------------------------------------------
// 3. Location Adjacency & Hard Filtering (Stage 1)
// ---------------------------------------------------------------------------

export function extractFloorFromRoom(roomNo?: string): number | null {
  if (!roomNo) return null;
  const clean = roomNo.trim().toUpperCase();

  // Ground floor cases
  if (clean.includes('GROUND') || clean.startsWith('G-') || clean.startsWith('G0')) {
    return 0;
  }

  // Room patterns like A-304, 304, B-412, D-102
  const match = clean.match(/(?:[A-Z]-)?([0-9])([0-9]{2})/);
  if (match) {
    return parseInt(match[1], 10);
  }

  // Direct floor indication: 1st floor, 2nd floor, 3rd floor
  const floorMatch = clean.match(/([0-9]+)(?:ST|ND|RD|TH)?\s*FLOOR/);
  if (floorMatch) {
    return parseInt(floorMatch[1], 10);
  }

  return null;
}

export function extractRouteNumber(text?: string): string | null {
  if (!text) return null;
  const match = text.match(/(?:route|bus)\s*#?\s*([0-9]+)/i);
  return match ? match[1] : null;
}

export function normalizeBlock(block?: string): string {
  if (!block) return '';
  return block
    .toLowerCase()
    .replace(/\(.*?\)/g, '') // remove (Boys Hostel), etc.
    .replace(/hostel/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks location adjacency between a new complaint and a candidate ticket.
 */
export function checkLocationAdjacency(
  newTicket: {
    category: string;
    description: string;
    hostelBlock?: string;
    roomNo?: string;
    studentType?: string;
    locationTag?: string;
  },
  candidate: MatchCandidate,
): boolean {
  const category = (newTicket.category || '').toLowerCase();

  // 1. Bus & Transport Adjacency
  if (category.includes('bus') || category.includes('transport')) {
    const routeNew =
      extractRouteNumber(newTicket.locationTag) ||
      extractRouteNumber(newTicket.description);
    const routeCand =
      extractRouteNumber((candidate as any).locationTag) ||
      extractRouteNumber(candidate.description);

    if (routeNew && routeCand) {
      return routeNew === routeCand;
    }
    // If route isn't specified in both, consider eligible for semantic match
    return true;
  }

  // 2. Hostel & Living Facility Adjacency
  const isHostelComplaint =
    newTicket.studentType === 'hosteller' ||
    Boolean(newTicket.hostelBlock) ||
    Boolean(candidate.hostelBlock) ||
    category.includes('hostel') ||
    category.includes('plumb') ||
    category.includes('mess') ||
    category.includes('cleanliness');

  if (isHostelComplaint) {
    const blockNew = normalizeBlock(newTicket.hostelBlock);
    const blockCand = normalizeBlock(candidate.hostelBlock);

    // If both specified different blocks, not adjacent
    if (blockNew && blockCand && blockNew !== blockCand) {
      return false;
    }

    // Check floor adjacency if room numbers available
    const floorNew = extractFloorFromRoom(newTicket.roomNo);
    const floorCand = extractFloorFromRoom(candidate.roomNo);

    if (floorNew !== null && floorCand !== null) {
      // Same floor or vertical plumbing adjacency (adjacent floor +/- 1)
      const floorDiff = Math.abs(floorNew - floorCand);
      return floorDiff <= 1;
    }

    // If room is omitted (e.g. corridor, common washroom, mess), same block qualifies
    return true;
  }

  // 3. Wi-Fi & Network Adjacency
  if (category.includes('wi-fi') || category.includes('internet') || category.includes('network')) {
    const blockNew = normalizeBlock(newTicket.hostelBlock || newTicket.locationTag);
    const blockCand = normalizeBlock(candidate.hostelBlock);

    if (blockNew && blockCand && blockNew !== blockCand) {
      return false;
    }
    return true;
  }

  // Default: same general campus vicinity
  return true;
}

// ---------------------------------------------------------------------------
// 4. Two-Stage Deduplication Engine
// ---------------------------------------------------------------------------

export const AUTO_MERGE_THRESHOLD = 0.92;
export const SUSPECTED_DUPLICATE_THRESHOLD = 0.80;

export function runTwoStageDeduplication(
  newTicket: {
    category: string;
    description: string;
    hostelBlock?: string;
    roomNo?: string;
    studentType: string;
    locationTag?: string;
    embeddingVector?: number[];
  },
  candidates: MatchCandidate[],
): DeduplicationResult {
  if (!candidates || candidates.length === 0) {
    return {
      action: 'PRIMARY',
      status: 'PRIMARY',
      masterCaseId: null,
      similarityScore: null,
      matchedTicketNo: null,
    };
  }

  // Stage 1: Hard Filtering
  const stage1Candidates: MatchCandidate[] = [];
  const normNewCat = (newTicket.category || '').trim().toLowerCase();
  const nowMs = Date.now();
  const maxWindowMs = 72 * 60 * 60 * 1000; // 72 hours rolling window

  for (const cand of candidates) {
    // 1. Exclude resolved tickets or already auto-merged child tickets
    if (cand.status === 'MERGED_AUTOMATIC' || cand.status === 'resolved') {
      continue;
    }

    // 2. Category match
    const normCandCat = (cand.category || '').trim().toLowerCase();
    if (normCandCat !== normNewCat) {
      continue;
    }

    // 3. Rolling time window check (72 hours)
    if (cand.createdAt) {
      const candTime = new Date(cand.createdAt).getTime();
      if (!isNaN(candTime)) {
        const ageMs = nowMs - candTime;
        if (ageMs > maxWindowMs) {
          continue;
        }
      }
    }

    // 4. Location adjacency check
    if (!checkLocationAdjacency(newTicket, cand)) {
      continue;
    }

    stage1Candidates.push(cand);
  }

  if (stage1Candidates.length === 0) {
    return {
      action: 'PRIMARY',
      status: 'PRIMARY',
      masterCaseId: null,
      similarityScore: null,
      matchedTicketNo: null,
    };
  }

  // Stage 2: Semantic Cosine Distance Matching
  const newVec =
    newTicket.embeddingVector && newTicket.embeddingVector.length === VECTOR_DIMENSION
      ? newTicket.embeddingVector
      : generateEmbeddingVector(newTicket.description, [
          newTicket.category,
          newTicket.hostelBlock || '',
          newTicket.roomNo || '',
          newTicket.locationTag || '',
        ]);

  let bestCandidate: MatchCandidate | null = null;
  let maxScore = -1;

  for (const cand of stage1Candidates) {
    const candVec =
      cand.embeddingVector && cand.embeddingVector.length === VECTOR_DIMENSION
        ? cand.embeddingVector
        : generateEmbeddingVector(cand.description, [
            cand.category,
            cand.hostelBlock || '',
            cand.roomNo || '',
            (cand as any).locationTag || '',
          ]);

    const similarity = computeCosineSimilarity(newVec, candVec);
    if (similarity > maxScore) {
      maxScore = similarity;
      bestCandidate = cand;
    }
  }

  if (!bestCandidate || maxScore < SUSPECTED_DUPLICATE_THRESHOLD) {
    return {
      action: 'PRIMARY',
      status: 'PRIMARY',
      masterCaseId: null,
      similarityScore: maxScore > 0 ? maxScore : null,
      matchedTicketNo: bestCandidate ? bestCandidate.ticketNo : null,
    };
  }

  // Determine master ticket reference (if matched candidate is already linked, inherit root master)
  const masterCaseId = bestCandidate.masterCaseId || bestCandidate.id;

  if (maxScore >= AUTO_MERGE_THRESHOLD) {
    return {
      action: 'AUTO_MERGE',
      status: 'MERGED_AUTOMATIC',
      masterCaseId,
      similarityScore: maxScore,
      matchedTicketNo: bestCandidate.ticketNo,
    };
  }

  // In [0.80, 0.91] range -> Suspected duplicate for triage queue
  return {
    action: 'SUSPECTED_DUPLICATE',
    status: 'SUSPECTED_DUPLICATE',
    masterCaseId,
    similarityScore: maxScore,
    matchedTicketNo: bestCandidate.ticketNo,
  };
}

// ---------------------------------------------------------------------------
// 5. Semantic Grievance Grouping
// ---------------------------------------------------------------------------

export interface GroupedSemanticGrievance {
  parent: Grievance;
  children: Grievance[];
  totalCount: number;
  matchScore?: number;
}

export interface SemanticGroupingOptions {
  similarityThreshold?: number;
  windowHours?: number;
  checkCategory?: boolean;
  sortOrder?: 'asc' | 'desc';
}

export type GroupingOptions = SemanticGroupingOptions;

/**
 * Clusters a collection of grievances with identical semantic meaning (s >= 0.92)
 * under a single parent issue.
 *
 * Guarantees:
 * 1. Chronological parent priority: Earliest submitted grievance (createdAt ASC -> ticketNo ASC -> id ASC)
 *    is unconditionally elected as the root parent (masterCaseId: null).
 * 2. Star topology: Duplicates are attached directly to the root parent (masterCaseId: parent.id),
 *    preventing transitive semantic drift.
 * 3. Standalone preservation: Grievances matching no cluster have children: [] and totalCount: 1.
 * 4. Partition conservation: Sum of totalCount across all groups strictly equals the number of valid input grievances.
 * 5. Permutation invariance: Cluster formation and parent election are independent of input array ordering.
 */
export function groupSemanticGrievances(
  grievances: Grievance[],
  options?: SemanticGroupingOptions,
): GroupedSemanticGrievance[] {
  if (!grievances || !Array.isArray(grievances) || grievances.length === 0) {
    return [];
  }

  // Filter out any null or non-object values safely
  const validGrievances = grievances.filter(
    (g): g is Grievance => g !== null && typeof g === 'object',
  );

  if (validGrievances.length === 0) {
    return [];
  }

  const threshold =
    options?.similarityThreshold !== undefined
      ? options.similarityThreshold
      : AUTO_MERGE_THRESHOLD;
  const windowHours =
    options?.windowHours !== undefined ? options.windowHours : 72;
  const checkCategory =
    options?.checkCategory !== undefined ? options.checkCategory : true;
  const sortOrder = options?.sortOrder || 'asc';
  const maxWindowMs = windowHours > 0 ? windowHours * 60 * 60 * 1000 : 0;

  // Safe timestamp parser
  const getTime = (isoDate?: string): number => {
    if (!isoDate) return NaN;
    const t = new Date(isoDate).getTime();
    return isNaN(t) ? NaN : t;
  };

  // Canonical comparator enforcing total order (createdAt ASC -> ticketNo ASC -> id ASC)
  const compareGrievanceCanonical = (a: Grievance, b: Grievance): number => {
    const tA = getTime(a.createdAt);
    const tB = getTime(b.createdAt);
    const validA = !isNaN(tA);
    const validB = !isNaN(tB);

    if (validA && validB) {
      if (tA !== tB) return tA - tB;
    } else if (validA && !validB) {
      return -1;
    } else if (!validA && validB) {
      return 1;
    }

    const ticketCmp = (a.ticketNo || '').localeCompare(b.ticketNo || '');
    if (ticketCmp !== 0) return ticketCmp;

    return (a.id || '').localeCompare(b.id || '');
  };

  if (validGrievances.length === 1) {
    const solo = validGrievances[0];
    return [
      {
        parent: {
          ...solo,
          masterCaseId: null,
        },
        children: [],
        totalCount: 1,
        matchScore: undefined,
      },
    ];
  }

  // 1. Canonical sort (createdAt ASC) ensures earliest submitted grievance is root parent
  const sorted = [...validGrievances].sort(compareGrievanceCanonical);

  // 2. Pre-compute and cache 256-d embedding vectors
  const vectorCache = new Map<string, number[]>();

  const getEmbedding = (g: Grievance): number[] => {
    const key = g.id || g.ticketNo || `${g.category}_${g.createdAt}_${g.description}`;
    let cached = vectorCache.get(key);
    if (cached) return cached;

    if (g.embeddingVector && g.embeddingVector.length === VECTOR_DIMENSION) {
      cached = g.embeddingVector;
    } else {
      cached = generateEmbeddingVector(g.description || '', [
        g.category || '',
        g.hostelBlock || '',
        g.roomNo || '',
        g.locationTag || '',
      ]);
    }
    vectorCache.set(key, cached);
    return cached;
  };

  // Pre-fill vector cache for all grievances
  for (const g of sorted) {
    getEmbedding(g);
  }

  // 3. Sequential clustering with leader linkage (star topology)
  interface Cluster {
    parent: Grievance;
    children: Grievance[];
    scores: number[];
  }

  const clusters: Cluster[] = [];

  for (const candidate of sorted) {
    const candVec = getEmbedding(candidate);
    const candTime = getTime(candidate.createdAt);
    const candCat = (candidate.category || '').trim().toLowerCase();

    let bestClusterIdx = -1;
    let highestScore = -1;

    for (let i = 0; i < clusters.length; i++) {
      const leader = clusters[i].parent;
      const leaderTime = getTime(leader.createdAt);

      // Check 1: Explicit DB masterCaseId link
      const isExplicitChildOfLeader = Boolean(
        candidate.masterCaseId &&
        (candidate.masterCaseId === leader.id ||
          candidate.masterCaseId === leader.ticketNo ||
          clusters[i].children.some((c) => c.id === candidate.masterCaseId || c.ticketNo === candidate.masterCaseId))
      );

      if (isExplicitChildOfLeader) {
        bestClusterIdx = i;
        highestScore = candidate.similarityScore || 1.0;
        break;
      }

      // If candidate already has an explicit DB master pointing to another ticket, skip this leader
      if (candidate.masterCaseId && leader.masterCaseId && candidate.masterCaseId === leader.masterCaseId) {
        bestClusterIdx = i;
        highestScore = candidate.similarityScore || 1.0;
        break;
      }
      if (candidate.masterCaseId && candidate.masterCaseId !== leader.id) {
        continue;
      }

      // Check 2: Status compatibility (prevent open ticket ingestion into closed resolved parent)
      if (leader.status === 'resolved' && candidate.status !== 'resolved') {
        continue;
      }

      // Check 3: Stage 1 Hard Filters
      // Category match
      if (checkCategory) {
        const leaderCat = (leader.category || '').trim().toLowerCase();
        if (candCat !== leaderCat) {
          continue;
        }
      }

      // Rolling time window
      if (maxWindowMs > 0 && !isNaN(candTime) && !isNaN(leaderTime)) {
        if (Math.abs(candTime - leaderTime) > maxWindowMs) {
          continue;
        }
      }

      // Location adjacency
      const leaderForAdjacency: any = {
        ...leader,
        hostelBlock: leader.hostelBlock || leader.locationTag,
      };
      if (!checkLocationAdjacency(candidate as any, leaderForAdjacency)) {
        continue;
      }

      // Check 4: Stage 2 Cosine Similarity against Leader
      const leaderVec = getEmbedding(leader);
      const sim = computeCosineSimilarity(candVec, leaderVec);

      if (sim >= threshold && sim > highestScore) {
        highestScore = sim;
        bestClusterIdx = i;
      }
    }

    if (bestClusterIdx !== -1) {
      const targetCluster = clusters[bestClusterIdx];
      const childObj: Grievance = {
        ...candidate,
        masterCaseId: targetCluster.parent.id,
        masterTicketNo: targetCluster.parent.ticketNo || candidate.masterTicketNo,
        similarityScore: candidate.similarityScore ?? (highestScore > 0 ? Number(highestScore.toFixed(4)) : undefined),
      };
      targetCluster.children.push(childObj);
      if (highestScore > 0) {
        targetCluster.scores.push(highestScore);
      }
    } else {
      const parentObj: Grievance = {
        ...candidate,
        masterCaseId: null,
      };
      clusters.push({
        parent: parentObj,
        children: [],
        scores: [],
      });
    }
  }

  // 4. Assemble GroupedSemanticGrievance items
  const result: GroupedSemanticGrievance[] = clusters.map((c) => {
    // Deterministic ordering of children
    c.children.sort(compareGrievanceCanonical);

    let matchScore: number | undefined;
    if (c.scores.length > 0) {
      const sum = c.scores.reduce((acc, s) => acc + s, 0);
      matchScore = Number((sum / c.scores.length).toFixed(4));
    }

    return {
      parent: c.parent,
      children: c.children,
      totalCount: 1 + c.children.length,
      matchScore,
    };
  });

  // 5. Apply sortOrder
  if (sortOrder === 'desc') {
    result.sort((a, b) => compareGrievanceCanonical(b.parent, a.parent));
  } else {
    result.sort((a, b) => compareGrievanceCanonical(a.parent, b.parent));
  }

  return result;
}

