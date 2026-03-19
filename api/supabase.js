// ── Supabase helper (dùng chung cho admin + booking proxy) ──
// Đọc từ env var (set trong Netlify dashboard)
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://uvtstwnighmmzuhfissy.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2dHN0d25pZ2htbXp1aGZpc3N5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NjIwNjQsImV4cCI6MjA4OTQzODA2NH0.lALuTksG4DxMHRnwqanaYTEoMlLD41ebzyhXziACx5c';

const SB_HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

// ── Generic fetch wrapper ──
async function sbFetch(path, method = 'GET', body = null) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const opts = { method, headers: SB_HEADERS };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${method} ${path} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

// ═══════════════════════════════════════════
// BOOKINGS
// ═══════════════════════════════════════════

async function sbReadBookings(date) {
  const filter = date ? `date=eq.${date}&` : '';
  return sbFetch(`bookings?${filter}order=created_at.desc`);
}

async function sbWriteBooking(p) {
  // Map từ params GAS sang Supabase schema
  const row = {
    id:            p.id || undefined,
    customer_name: p.name || '',
    phone:         p.phone || '',
    court:         p.court || '',
    date:          p.date || null,
    start_time:    p.startHour || '',
    end_time:      p.endHour || '',
    hours:         Number(p.duration) || 1,
    price:         Number(p.total) || 0,
    status:        p.status || 'pending',
    member_id:     p.memberId || null,
    note:          p.note || '',
    payment:       p.payment || 'cash',
    players:       Number(p.players) || 0,
    rackets:       Number(p.rackets) || 0,
    court_total:   Number(p.courtTotal) || 0,
    racket_total:  Number(p.racketTotal) || 0,
  };
  // Upsert theo id
  return sbFetch('bookings', 'POST', row);
}

async function sbUpdateBooking(id, fields) {
  return sbFetch(`bookings?id=eq.${id}`, 'PATCH', fields);
}

async function sbCheckSlot(date, court, hours) {
  // Lấy bookings trong ngày + sân để check overlap
  const rows = await sbFetch(`bookings?date=eq.${date}&court=eq.${encodeURIComponent(court)}&status=neq.cancelled`);
  return rows || [];
}

// ═══════════════════════════════════════════
// MEMBERS
// ═══════════════════════════════════════════

async function sbGetMember(phone) {
  const rows = await sbFetch(`members?phone=eq.${encodeURIComponent(phone)}`);
  return rows && rows.length ? rows[0] : null;
}

async function sbRegisterMember(data) {
  return sbFetch('members', 'POST', {
    name:          data.name || '',
    phone:         data.phone || '',
    email:         data.email || '',
    tier:          'silver',
    total_spent:   0,
    referral_code: data.referralCode || Math.random().toString(36).slice(2,8).toUpperCase(),
    referred_by:   data.referredBy || null,
    pass_hash:     data.passHash || '',
  });
}

async function sbUpdateMemberSpent(phone, amount) {
  const member = await sbGetMember(phone);
  if (!member) throw new Error('Member not found');
  const newSpent = (member.total_spent || 0) + Number(amount);
  // Tính tier
  let tier = 'silver';
  if (newSpent >= 6000000) tier = 'diamond';
  else if (newSpent >= 2000000) tier = 'gold';
  return sbFetch(`members?phone=eq.${encodeURIComponent(phone)}`, 'PATCH', {
    total_spent: newSpent,
    tier
  });
}

// ═══════════════════════════════════════════
// FNB MENU
// ═══════════════════════════════════════════

async function sbReadFnbMenu(customerOnly = false) {
  const filter = customerOnly ? 'available=eq.true&' : '';
  return sbFetch(`fnb_menu?${filter}order=category.asc,name.asc`);
}

async function sbSaveFnbItem(item) {
  if (item.id) {
    // Update
    return sbFetch(`fnb_menu?id=eq.${item.id}`, 'PATCH', {
      name:      item.name,
      price:     Number(item.price) || 0,
      category:  item.category || item.cat || 'other',
      image_url: item.img || item.image_url || '',
      available: item.active !== 'false' && item.active !== false,
    });
  } else {
    // Insert
    return sbFetch('fnb_menu', 'POST', {
      name:      item.name,
      price:     Number(item.price) || 0,
      category:  item.category || item.cat || 'other',
      image_url: item.img || '',
      available: true,
    });
  }
}

async function sbDeleteFnbItem(id) {
  return sbFetch(`fnb_menu?id=eq.${id}`, 'DELETE');
}

// ═══════════════════════════════════════════
// FNB ORDERS
// ═══════════════════════════════════════════

async function sbReadFnbOrders() {
  return sbFetch('fnb_orders?order=created_at.desc&limit=200');
}

async function sbSubmitFnbOrder(data) {
  return sbFetch('fnb_orders', 'POST', {
    booking_id: data.bookingId || null,
    items:      typeof data.items === 'string' ? JSON.parse(data.items) : data.items,
    total:      Number(data.total) || 0,
    status:     'pending',
    court:      data.court || '',
    note:       data.note || '',
  });
}

async function sbUpdateFnbOrderStatus(id, status) {
  return sbFetch(`fnb_orders?id=eq.${id}`, 'PATCH', { status });
}

// ═══════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════

async function sbReadConfig() {
  const rows = await sbFetch('config');
  const cfg = {};
  (rows || []).forEach(r => { cfg[r.key] = r.value; });
  return cfg;
}

async function sbWriteConfig(kvPairs) {
  // Upsert từng key
  const rows = Object.entries(kvPairs).map(([key, value]) => ({ key, value: String(value) }));
  return sbFetch('config', 'POST', rows.length === 1 ? rows[0] : rows);
}

module.exports = {
  sbReadBookings, sbWriteBooking, sbUpdateBooking, sbCheckSlot,
  sbGetMember, sbRegisterMember, sbUpdateMemberSpent,
  sbReadFnbMenu, sbSaveFnbItem, sbDeleteFnbItem,
  sbReadFnbOrders, sbSubmitFnbOrder, sbUpdateFnbOrderStatus,
  sbReadConfig, sbWriteConfig,
};
