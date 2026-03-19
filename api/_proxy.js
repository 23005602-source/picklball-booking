const https = require('https');
const sb = require('./supabase');

const SCRIPT_URL = process.env.APPS_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbzGgUfBgmEx1xFLfTtVLOhA2GuSsbpz6WuLrAG8KyLuXJdskYofHgT2DJtol-ApKlDE/exec';

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store'
};

let configCache     = null;
let configCacheTime = 0;
const CONFIG_TTL    = 10 * 60 * 1000;

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function gasBackup(url) {
  fetchUrl(url).catch(e => console.warn('[GAS backup]', e.message));
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  const params = event.queryStringParameters || {};
  const action = params.action || 'write';

  // ── CONFIG ──
  if (action === 'readConfig') {
    const now = Date.now();
    if (configCache && (now - configCacheTime) < CONFIG_TTL) {
      return { statusCode: 200, headers: { ...CORS, 'X-Cache': 'HIT' }, body: JSON.stringify(configCache) };
    }
    try {
      const cfg = await sb.sbReadConfig();
      if (cfg && Object.keys(cfg).length > 0) {
        configCache = cfg; configCacheTime = Date.now();
        return { statusCode: 200, headers: { ...CORS, 'X-Cache': 'SB' }, body: JSON.stringify(cfg) };
      }
    } catch(e) { console.warn('[SB readConfig]', e.message); }
    try {
      const data = await fetchUrl(SCRIPT_URL + '?action=readConfig');
      configCache = JSON.parse(data); configCacheTime = Date.now();
      return { statusCode: 200, headers: { ...CORS, 'X-Cache': 'GAS' }, body: data };
    } catch(err) {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
    }
  }

  // ── READ BOOKINGS ──
  if (action === 'read' || action === 'readJson') {
    try {
      const rows = await sb.sbReadBookings(params.date || null);
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ data: rows, source: 'supabase' }) };
    } catch(e) {
      const url = params.date ? `${SCRIPT_URL}?action=readJson&date=${encodeURIComponent(params.date)}` : `${SCRIPT_URL}?action=read`;
      try { const data = await fetchUrl(url); return { statusCode: 200, headers: CORS, body: data }; }
      catch(e2) { return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e2.message }) }; }
    }
  }

  // ── WRITE BOOKING ──
  if (action === 'write') {
    const clean = {
      name: String(params.name || '').trim().slice(0,100),
      phone: String(params.phone || '').trim().slice(0,15),
      date: String(params.date || '').trim(),
      court: String(params.court || '').trim(),
      startHour: String(params.startHour || '').trim(),
      duration: String(Number(params.duration) || 1),
      players: String(Number(params.players) || 4),
      rackets: String(Number(params.rackets) || 0),
      courtTotal: String(Number(params.courtTotal) || 0),
      racketTotal: String(Number(params.racketTotal) || 0),
      total: String(Number(params.total) || 0),
      status: 'pending',
      payment: String(params.payment || 'cash'),
      note: String(params.note || '').slice(0,300),
      memberId: String(params.memberId || ''),
    };
    try {
      const result = await sb.sbWriteBooking(clean);
      gasBackup(`${SCRIPT_URL}?${new URLSearchParams(clean).toString()}`);
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, data: result, source: 'supabase' }) };
    } catch(e) {
      try { const data = await fetchUrl(`${SCRIPT_URL}?${new URLSearchParams(clean).toString()}`); return { statusCode: 200, headers: CORS, body: data }; }
      catch(e2) { return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e2.message }) }; }
    }
  }

  // ── CHECK SLOT ──
  if (action === 'checkSlot') {
    try {
      const rows = await sb.sbCheckSlot(params.date, params.court, params.hours);
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ slots: rows, source: 'supabase' }) };
    } catch(e) {
      try { const data = await fetchUrl(`${SCRIPT_URL}?${new URLSearchParams(params).toString()}`); return { statusCode: 200, headers: CORS, body: data }; }
      catch(e2) { return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e2.message }) }; }
    }
  }

  // ── MEMBERSHIP — vẫn GAS (có OTP email) ──
  if (['registerMember','getMember','addPoints','loginMember','resetMemberPass',
       'memberOtp','verifyMemberOtp','useVoucher','updateMemberMonthlySpent'].includes(action)) {
    try {
      const data = await fetchUrl(`${SCRIPT_URL}?${new URLSearchParams(params).toString()}`);
      return { statusCode: 200, headers: CORS, body: data };
    } catch(e) {
      return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: e.message }) };
    }
  }

  // ── Default pass-through ──
  try {
    const data = await fetchUrl(`${SCRIPT_URL}?${new URLSearchParams(params).toString()}`);
    return { statusCode: 200, headers: CORS, body: data };
  } catch(err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
