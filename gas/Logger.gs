/**
 * PII（個人識別情報）マスキング機能を持つロガーサービス。
 * ログ出力時に自動的に電話番号・氏名をマスクする。
 */
const LoggerService = {
  maskPhone: function(phone) {
    if (!phone) return phone;
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length < 10) return '***';
    return digits.slice(0, 3) + '-****-' + digits.slice(-4);
  },

  maskName: function(name) {
    if (!name) return name;
    const chars = String(name);
    if (chars.length <= 1) return '*';
    return chars.charAt(0) + '***';
  },

  maskPII: function(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const out = Object.assign({}, obj);
    if (out.name) out.name = this.maskName(out.name);
    if (out.customerName) out.customerName = this.maskName(out.customerName);
    if (out.nameKanji) out.nameKanji = this.maskName(out.nameKanji);
    if (out.nameKana) out.nameKana = this.maskName(out.nameKana);
    if (out.customerNameKanji) out.customerNameKanji = this.maskName(out.customerNameKanji);
    if (out.customerNameKana) out.customerNameKana = this.maskName(out.customerNameKana);
    if (out.phone) out.phone = this.maskPhone(out.phone);
    return out;
  },

  warn: function(message, context) {
    const safeContext = this.maskPII(context || {});
    console.warn('[WARN] ' + message + ' ' + JSON.stringify(safeContext));
    // WARN以上もシートに記録（署名なし等の重要警告を追跡できるように）
    this._recordToSheet('WARN', message, safeContext);
  },

  info: function(message, context) {
    console.log('[INFO] ' + message + ' ' + JSON.stringify(this.maskPII(context || {})));
  },

  error: function(message, context) {
    const safeContext = this.maskPII(context || {});
    console.error('[ERROR] ' + message + ' ' + JSON.stringify(safeContext));
    this._recordToSheet('ERROR', message, safeContext);
    this._alertStaff(message);
  },

  // スタッフへのエラー通知（PushQuota経由・5分デデュプ・再帰防止）
  _ALERT_DEDUP_WINDOW_MS: 5 * 60 * 1000,
  _ALERT_DEDUP_KEY_PREFIX: 'alert_dedup:',

  _alertStaff: function(message) {
    try {
      const props = PropertiesService.getScriptProperties();
      const staff = props.getProperty('STAFF_LINE_USER_ID');
      const token = props.getProperty('LINE_CHANNEL_ACCESS_TOKEN');
      if (!staff || !token) return;

      // 5分デデュプ: 同一メッセージの連投を抑止
      const hash = this._hashMessage(message);
      const dedupKey = this._ALERT_DEDUP_KEY_PREFIX + hash;
      const lastSent = parseInt(props.getProperty(dedupKey) || '0', 10);
      const now = Date.now();
      if (lastSent && (now - lastSent) < this._ALERT_DEDUP_WINDOW_MS) return;

      // Quota チェック（通常の push と同じガードを経由）
      if (!PushQuotaGuard.canPush()) {
        // quota 超過時はシートログだけ残して黙る（LINE push は再帰誘発しないよう回避）
        console.warn('[ALERT_STAFF_BLOCKED] push quota exceeded; alert skipped: ' + message);
        return;
      }

      // LineClient.push を経由せず UrlFetchApp 直呼び（_call 内 error ログ→_alertStaff 再帰を回避）
      const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
        method: 'post',
        contentType: 'application/json',
        headers: { 'Authorization': 'Bearer ' + token },
        payload: JSON.stringify({ to: staff, messages: [{ type: 'text', text: '⚠️ [ERROR]\n' + message }] }),
        muteHttpExceptions: true
      });
      const code = res.getResponseCode();
      if (code < 400) {
        // 成功時のみ quota カウント＆デデュプ記録
        try { PushQuotaGuard.increment(); } catch (incErr) { /* silent */ }
        try { props.setProperty(dedupKey, String(now)); } catch (setErr) { /* silent */ }
      } else {
        console.warn('[ALERT_STAFF_FAIL] code=' + code + ' body=' + res.getContentText().slice(0, 200));
      }
    } catch (e) { /* silent: prevent recursion */ }
  },

  _hashMessage: function(message) {
    // 完全衝突回避ではなく同一メッセージ抑止が目的なのでMD5で十分
    const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(message || ''));
    return raw.map(function(b) {
      const v = b < 0 ? b + 256 : b;
      return (v < 16 ? '0' : '') + v.toString(16);
    }).join('');
  },

  _recordToSheet: function(level, message, maskedContext) {
    try {
      const ss = SpreadsheetApp.openById(Config.spreadsheetId());
      const sheet = ss.getSheetByName(SHEETS.logs) || ss.getSheetByName('Logs');
      if (sheet) {
        sheet.appendRow([new Date(), level, message, JSON.stringify(maskedContext)]);
      }
    } catch (e) { /* ログ記録失敗は無視（無限ループ回避） */ }
  }
};
