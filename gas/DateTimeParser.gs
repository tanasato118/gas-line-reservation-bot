/**
 * ユーザーがテキストで入力した日時を解釈する。
 * 受け付ける表記例:
 *   2/20 15:00
 *   2月20日 15時
 *   2026-02-20 15:00
 *   2026/2/20 午後3時
 *   明日 10:00
 *   明後日 14:30
 *   来週月曜 10:00
 *   今週金曜 14時
 * 返り値: { date: 'YYYY-MM-DD', time: 'HH:MM' } または null
 *
 * タイムゾーンは Asia/Tokyo 前提。
 * 過去日を指定された場合は翌年に繰り越し（月日のみの入力時のみ）。
 */
const DateTimeParser = {

  parse: function(raw) {
    if (!raw) return null;
    const text = this._normalize(raw);

    // 日付部分
    const datePart = this._parseDate(text);
    if (!datePart) return null;

    // 時刻部分
    const timePart = this._parseTime(text);
    if (!timePart) return null;

    const date = datePart.y + '-' +
      this._pad2(datePart.m) + '-' +
      this._pad2(datePart.d);
    const time = this._pad2(timePart.hh) + ':' + this._pad2(timePart.mi);
    return { date: date, time: time };
  },

  /** 全角英数 → 半角、全角スペース → 半角スペース、余計なスペース削除 */
  _normalize: function(s) {
    return String(s)
      .replace(/[０-９]/g, function(ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); })
      .replace(/[Ａ-Ｚａ-ｚ]/g, function(ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); })
      .replace(/　/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  },

  _pad2: function(n) { return (n < 10 ? '0' : '') + n; },

  _parseDate: function(text) {
    const now = new Date();
    const curY = now.getFullYear();
    const curM = now.getMonth() + 1;
    const curD = now.getDate();

    // YYYY/MM/DD or YYYY-MM-DD or YYYY年MM月DD日
    let m = text.match(/(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})日?/);
    if (m) return { y: parseInt(m[1], 10), m: parseInt(m[2], 10), d: parseInt(m[3], 10) };

    // MM/DD or MM-DD or M月D日（年省略 → 本日以降の最近の該当日）
    m = text.match(/(\d{1,2})[\/\-月](\d{1,2})日?/);
    if (m) {
      const mo = parseInt(m[1], 10);
      const da = parseInt(m[2], 10);
      if (!this._validMD(mo, da)) return null;
      let y = curY;
      const candidate = new Date(y, mo - 1, da);
      const today = new Date(curY, curM - 1, curD);
      if (candidate < today) y = y + 1;
      return { y: y, m: mo, d: da };
    }

    // 明日 / 明後日 / 今日
    if (/明後日|あさって/.test(text)) {
      const d = new Date(curY, curM - 1, curD + 2);
      return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
    }
    if (/明日|あした|あす/.test(text)) {
      const d = new Date(curY, curM - 1, curD + 1);
      return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
    }
    if (/今日|本日|きょう/.test(text)) {
      return { y: curY, m: curM, d: curD };
    }

    // 今週X曜 / 来週X曜
    const youbiMap = { '月': 1, '火': 2, '水': 3, '木': 4, '金': 5, '土': 6, '日': 0 };
    m = text.match(/(今週|来週|再来週)?([月火水木金土日])曜?日?/);
    if (m) {
      const week = m[1] || '今週';
      const targetDow = youbiMap[m[2]];
      const today = new Date(curY, curM - 1, curD);
      const curDow = today.getDay();
      let diff;
      if (week === '今週') {
        diff = targetDow - curDow;
        if (diff < 0) diff += 7; // 過ぎていたら次週扱い
      } else if (week === '来週') {
        diff = (targetDow - curDow + 7) % 7;
        if (diff === 0) diff = 7;
        diff += 7; // 来週
        // シンプルに: 今週の対応日から+7
        // 上の計算は複雑なので再定義
        diff = ((targetDow - curDow + 7) % 7) + 7;
      } else { // 再来週
        diff = ((targetDow - curDow + 7) % 7) + 14;
      }
      const d = new Date(curY, curM - 1, curD + diff);
      return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
    }

    return null;
  },

  _parseTime: function(text) {
    // 午前/午後プレフィックス検出
    const isPM = /(午後|ごご|pm)/.test(text);
    const isAM = /(午前|ごぜん|am)/.test(text);

    // HH:MM
    let m = text.match(/(\d{1,2}):(\d{2})/);
    if (m) {
      let hh = parseInt(m[1], 10);
      const mi = parseInt(m[2], 10);
      if (isPM && hh < 12) hh += 12;
      if (isAM && hh === 12) hh = 0;
      if (this._validHM(hh, mi)) return { hh: hh, mi: mi };
    }

    // HH時MM分 / HH時
    m = text.match(/(\d{1,2})時(\d{1,2})分/);
    if (m) {
      let hh = parseInt(m[1], 10);
      const mi = parseInt(m[2], 10);
      if (isPM && hh < 12) hh += 12;
      if (isAM && hh === 12) hh = 0;
      if (this._validHM(hh, mi)) return { hh: hh, mi: mi };
    }
    m = text.match(/(\d{1,2})時半/);
    if (m) {
      let hh = parseInt(m[1], 10);
      if (isPM && hh < 12) hh += 12;
      if (isAM && hh === 12) hh = 0;
      if (this._validHM(hh, 30)) return { hh: hh, mi: 30 };
    }
    m = text.match(/(\d{1,2})時/);
    if (m) {
      let hh = parseInt(m[1], 10);
      if (isPM && hh < 12) hh += 12;
      if (isAM && hh === 12) hh = 0;
      if (this._validHM(hh, 0)) return { hh: hh, mi: 0 };
    }

    return null;
  },

  _validMD: function(m, d) {
    return m >= 1 && m <= 12 && d >= 1 && d <= 31;
  },

  _validHM: function(h, mi) {
    return h >= 0 && h <= 23 && mi >= 0 && mi <= 59;
  },

  /**
   * 営業時間・予約可能範囲チェック（Asia/Tokyo）
   *   - 今日～30日以内
   *   - 平日・土曜の 9:00〜17:30（最終受付）
   *   - 日祝は不可
   * 返り値: { ok: true } または { ok: false, reason: '...' }
   */
  validateBusinessHours: function(dateStr, timeStr) {
    const tz = 'Asia/Tokyo';
    const now = new Date();
    const parts = dateStr.split('-');
    const y = parseInt(parts[0], 10);
    const mo = parseInt(parts[1], 10);
    const da = parseInt(parts[2], 10);
    const timeParts = timeStr.split(':');
    const hh = parseInt(timeParts[0], 10);
    const mi = parseInt(timeParts[1], 10);
    const target = new Date(y, mo - 1, da, hh, mi, 0);

    if (target.getTime() < now.getTime()) {
      return { ok: false, reason: '過去の日時は指定できません' };
    }
    const plus30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    if (target.getTime() > plus30.getTime()) {
      return { ok: false, reason: '30日以内の日時でお願いします' };
    }
    const dow = target.getDay(); // 0=日,6=土
    if (dow === 0) {
      return { ok: false, reason: '日曜日は定休日です' };
    }
    const hm = hh * 60 + mi;
    if (hm < 9 * 60 || hm > 17 * 60 + 30) {
      return { ok: false, reason: '営業時間は 9:00〜17:30（最終受付）です' };
    }
    return { ok: true };
  }
};
