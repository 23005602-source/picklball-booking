// ════════════════════════════════════════════════
// /api/notify — Telegram notification relay
// ════════════════════════════════════════════════
// Env vars cần set trên Netlify:
//   TG_BOT_TOKEN   — Bot token từ @BotFather
//   TG_CHAT_ORDERS — Chat ID nhóm đơn hàng  (số âm, vd: -1001234567890)
//   TG_CHAT_PAYMENT — Chat ID nhóm thanh toán

const https = require('https');

const BOT_TOKEN   = process.env.TG_BOT_TOKEN    || '8740240522:AAEAXHo4D7eGOkamymOUk9ejMIyq0yUyu1M';
const CHAT_ORDERS  = process.env.TG_CHAT_ORDERS  || '-5206781340';
const CHAT_PAYMENT = process.env.TG_CHAT_PAYMENT || '-5140447997';

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

function tgEscape(text) {
  // Escape MarkdownV2 special chars
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

function sendTelegram(chatId, text) {
  if (!BOT_TOKEN || !chatId) {
    console.warn('Telegram not configured — BOT_TOKEN or chatId missing');
    return Promise.resolve({ skipped: true });
  }
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
    });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function formatMoney(n) {
  return Number(n).toLocaleString('vi-VN') + 'đ';
}

function formatDatetime(iso) {
  try {
    const d = new Date(iso || Date.now());
    const pad = n => String(n).padStart(2,'0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;
  } catch(e) { return ''; }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch(e) { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { type, booking, cancelReason, staffName } = body;
  const now = formatDatetime();

  try {
    if (type === 'new_order') {
      // ── Gửi vào nhóm ĐƠN HÀNG ──
      const b = booking;
      const msg = [
        `🏓 *ĐƠN MỚI \\#${tgEscape(b.id || '?')}*`,
        ``,
        `👤 *${tgEscape(b.name)}*  📞 ${tgEscape(b.phone)}`,
        `📅 ${tgEscape(b.date)}  ⏰ ${tgEscape(b.startHour)} \\(${tgEscape(b.duration)} giờ\\)`,
        `🏟️ Sân ${tgEscape(b.court)}  👥 ${tgEscape(b.players)} người`,
        b.rackets > 0 ? `🏓 Thuê vợt: ${tgEscape(b.rackets)} cây` : null,
        ``,
        `💰 Sân: ${tgEscape(formatMoney(b.courtTotal))}${b.racketTotal > 0 ? '  \\+  Vợt: ' + tgEscape(formatMoney(b.racketTotal)) : ''}`,
        `💳 *Tổng: ${tgEscape(formatMoney(b.total))}*`,
        `📲 Thanh toán: ${tgEscape(b.payment === 'qr' ? '🔵 Chuyển khoản QR' : '🟡 Tiền mặt tại sân')}`,
        b.note ? `📝 Ghi chú: ${tgEscape(b.note)}` : null,
        ``,
        `🕐 ${tgEscape(now)}`,
      ].filter(l => l !== null).join('\n');
      await sendTelegram(CHAT_ORDERS, msg);
    }

    else if (type === 'payment_confirmed') {
      // ── Gửi vào nhóm THANH TOÁN ──
      const b = booking;
      const msg = [
        `✅ *XÁC NHẬN THANH TOÁN \\#${tgEscape(b.id || '?')}*`,
        ``,
        `👤 ${tgEscape(b.name)}  📞 ${tgEscape(b.phone)}`,
        `📅 ${tgEscape(b.date)}  🏟️ Sân ${tgEscape(b.court)}  ⏰ ${tgEscape(b.startHour)}`,
        ``,
        `💳 *${tgEscape(formatMoney(b.total))}*  —  ${tgEscape(b.payment === 'qr' ? '🔵 Đã chuyển khoản' : '🟡 Tiền mặt')}`,
        `✅ Đã xác nhận bởi: ${tgEscape(staffName || 'Hệ thống')}`,
        `🕐 ${tgEscape(now)}`,
      ].join('\n');
      await sendTelegram(CHAT_PAYMENT, msg);
    }

    else if (type === 'payment_qr_received') {
      // ── Chuyển khoản vào — gửi riêng nhóm THANH TOÁN ──
      const b = booking;
      const msg = [
        `💸 *NHẬN CHUYỂN KHOẢN \\#${tgEscape(b.id || '?')}*`,
        ``,
        `👤 ${tgEscape(b.name)}  📞 ${tgEscape(b.phone)}`,
        `💰 *${tgEscape(formatMoney(b.total))}*  —  MSB QR`,
        `📅 ${tgEscape(b.date)}  🏟️ Sân ${tgEscape(b.court)}`,
        ``,
        `⚠️ Vui lòng kiểm tra MSB app và xác nhận đơn trên Trang Quản lý`,
        `🕐 ${tgEscape(now)}`,
      ].join('\n');
      await sendTelegram(CHAT_PAYMENT, msg);
    }

    else if (type === 'order_cancelled') {
      // ── Hủy đơn — gửi cả 2 nhóm ──
      const b = booking;
      const reason = cancelReason || '(không có lý do)';
      const msgOrders = [
        `❌ *HỦY ĐƠN \\#${tgEscape(b.id || '?')}*`,
        ``,
        `👤 ${tgEscape(b.name)}  📞 ${tgEscape(b.phone)}`,
        `📅 ${tgEscape(b.date)}  🏟️ Sân ${tgEscape(b.court)}  ⏰ ${tgEscape(b.startHour)}`,
        ``,
        `❌ *Lý do hủy:* ${tgEscape(reason)}`,
        `👤 Hủy bởi: ${tgEscape(staffName || 'Nhân viên')}`,
        `🕐 ${tgEscape(now)}`,
      ].join('\n');
      const msgPayment = [
        `❌ *HỦY ĐƠN — KIỂM TRA HOÀN TIỀN \\#${tgEscape(b.id || '?')}*`,
        ``,
        `👤 ${tgEscape(b.name)}  📞 ${tgEscape(b.phone)}`,
        `💰 ${tgEscape(formatMoney(b.total))}  —  ${tgEscape(b.payment === 'qr' ? 'Đã CK' : 'Tiền mặt')}`,
        ``,
        `❌ *Lý do hủy:* ${tgEscape(reason)}`,
        `⚠️ Kiểm tra và xử lý hoàn tiền nếu cần`,
        `🕐 ${tgEscape(now)}`,
      ].join('\n');
      await Promise.all([
        sendTelegram(CHAT_ORDERS, msgOrders),
        sendTelegram(CHAT_PAYMENT, msgPayment),
      ]);
    }

    else {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Unknown type: ' + type }) };
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true }) };

  } catch(e) {
    console.error('Telegram error:', e.message);
    // Không fail booking vì lỗi Telegram — chỉ log
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true, tgError: e.message }) };
  }
};
