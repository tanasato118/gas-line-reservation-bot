const Security = {
  verifySignature: function(body, signature, channelSecret) {
    if (!signature || !body || !channelSecret) return false;
    const hash = Utilities.computeHmacSha256Signature(body, channelSecret);
    const computed = Utilities.base64Encode(hash);
    return this._constantTimeEquals(computed, signature);
  },
  _constantTimeEquals: function(a, b) {
    const maxLen = Math.max(a.length, b.length);
    let diff = a.length ^ b.length;
    for (let i = 0; i < maxLen; i++) {
      diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    }
    return diff === 0;
  }
};

Security.validatePhone = function(v) {
  if (typeof v !== 'string') return false;
  const digits = v.replace(/[-\s]/g, '');
  return /^0\d{9,10}$/.test(digits);
};

Security.validateName = function(v) {
  if (typeof v !== 'string') return false;
  const trimmed = v.trim();
  return trimmed.length >= 1 && trimmed.length <= 50;
};

/**
 * 「漢字氏名」＋「フリガナ」両方を受け取る入力をパースする。
 * 許容形式:
 *   「山田 太郎／ヤマダ タロウ」「山田 太郎/ヤマダ タロウ」
 *   「山田太郎（ヤマダタロウ）」「山田太郎(ヤマダタロウ)」
 *   改行区切り「山田 太郎\nヤマダ タロウ」
 *   連結「山田太郎ヤマダタロウ」（漢字のあとにカタカナ／ひらがなが続く）
 * フリガナは ひらがな / カタカナ / 長音「ー」/ 中黒「・」/ スペース のみ可。
 * ひらがなはカタカナに正規化して返す。
 * @return {{ok:true, name:string, kana:string} | {ok:false, reason:string}}
 */
Security.parseNameAndKana = function(raw) {
  if (typeof raw !== 'string') return { ok: false, reason: 'invalid' };
  const s = Security.stripTags(raw).replace(/\r\n/g, '\n').trim();
  if (!s) return { ok: false, reason: 'empty' };

  // 括弧でカナを囲むパターン
  let m = /^(.+?)[\s　]*[（(][\s　]*([^）)]+?)[\s　]*[）)][\s　]*$/.exec(s);
  if (m) return Security._buildNameKana(m[1], m[2]);

  // ／ / 改行 で区切るパターン
  const parts = s.split(/[\s　]*[／\/\n][\s　]*/).filter(function(p){ return p.length > 0; });
  if (parts.length >= 2) return Security._buildNameKana(parts[0], parts.slice(1).join(' '));

  // 漢字とカナの連結パターン（区切り文字なし）
  //   例: 「山田太郎ヤマダタロウ」「山田太郎やまだたろう」
  //   先頭を漢字1文字以上、そのあとカタカナ／ひらがなブロックを末尾まで。
  //   間にスペースがあっても可。
  const concat = /^([\u4E00-\u9FFF\u3400-\u4DBF々〆\s　]*[\u4E00-\u9FFF\u3400-\u4DBF々〆][\u4E00-\u9FFF\u3400-\u4DBF々〆\s　]*)([\u3040-\u309F\u30A0-\u30FFー・][\u3040-\u309F\u30A0-\u30FFー・\s　]*)$/.exec(s);
  if (concat) return Security._buildNameKana(concat[1], concat[2]);

  return { ok: false, reason: 'need_both' };
};

Security._buildNameKana = function(name, kana) {
  name = String(name).trim();
  kana = String(kana).trim();
  if (!name || !kana) return { ok: false, reason: 'need_both' };
  if (name.length < 1 || name.length > 50) return { ok: false, reason: 'name_length' };
  if (kana.length < 1 || kana.length > 50) return { ok: false, reason: 'kana_length' };
  // フリガナ: ひらがな・カタカナ・長音・中黒・空白のみ
  if (!/^[\u3040-\u309F\u30A0-\u30FFー・\s　]+$/.test(kana)) {
    return { ok: false, reason: 'kana_invalid' };
  }
  // ひらがな → カタカナ 正規化
  const kanaNormalized = kana.replace(/[\u3041-\u3096]/g, function(c) {
    return String.fromCharCode(c.charCodeAt(0) + 0x60);
  }).replace(/[\s　]+/g, ' ').trim();
  return { ok: true, name: name, kana: kanaNormalized };
};

/** 名前入力プロンプトの共通文言 */
Security.NAME_PROMPT =
  'お名前（フルネーム）を教えてください。\n' +
  '漢字とフリガナの両方をお願いします。\n\n' +
  '▼入力例（どれでもOK）\n' +
  '　山田 太郎／ヤマダ タロウ\n' +
  '　山田太郎（ヤマダタロウ）\n' +
  '　1行目に漢字、2行目にフリガナ';

/** パース失敗時のエラー文言 */
Security.NAME_ERROR =
  '漢字のお名前とフリガナの両方が必要です。\n\n' +
  '▼入力例\n' +
  '　山田 太郎／ヤマダ タロウ\n' +
  '　山田太郎（ヤマダタロウ）\n\n' +
  '※ フリガナはカタカナ・ひらがなでご入力ください。';

Security.validateLicensePlate = function(v) {
  return typeof v === 'string' && /^\d{1,4}$/.test(v);
};

Security.validateYear = function(v) {
  const n = parseInt(v, 10);
  const current = new Date().getFullYear();
  return !isNaN(n) && n >= 1980 && n <= current;
};

Security.validateFreeText = function(v, maxLen) {
  maxLen = maxLen || 500;
  return typeof v === 'string' && v.length > 0 && v.length <= maxLen;
};

Security.stripTags = function(v) {
  if (typeof v !== 'string') return v;
  return v.replace(/<[^>]*>/g, '');
};

Security.sanitizeForSheet = function(value) {
  if (typeof value !== 'string') return value;
  // Google Sheets formula injection: =, +, -, @, tab, pipe
  if (/^[=+\-@\t|]/.test(value)) return "'" + value;
  return value;
};

Security.sanitizeRow = function(row) {
  return row.map(v => Security.sanitizeForSheet(v));
};

Security.rateLimit = function(userId, limit, windowSec) {
  // スタッフアカウントはレート制限を免除
  const staffId = typeof Config !== 'undefined' ? Config.getOptional('STAFF_LINE_USER_ID', '') : '';
  if (staffId && userId === staffId) return true;

  limit = limit || 10;
  windowSec = windowSec || 60;
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(500);
  } catch (e) {
    LoggerService.warn('rate limit lock timeout', { userId: userId });
    return false;
  }
  try {
    const cache = CacheService.getScriptCache();
    const key = 'rl:' + userId;
    const current = parseInt(cache.get(key) || '0', 10);
    if (current >= limit) {
      LoggerService.warn('rate limit exceeded', { userId: userId, count: current });
      return false;
    }
    cache.put(key, String(current + 1), windowSec);
    return true;
  } finally {
    lock.releaseLock();
  }
};
