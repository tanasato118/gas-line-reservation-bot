/**
 * LINE push API 月次送信枠の監視・ガード。
 *
 * プラン別の既定値:
 *   - コミュニケーションプラン（無料）:     200 通 → THRESHOLDS [140, 180, 200]
 *   - ライトプラン（月5,000円）:         15,000 通 → THRESHOLDS [10500, 13500, 15000]  ← 2026-05-01〜 現行
 *   - スタンダードプラン（月15,000円）:   45,000 通 → THRESHOLDS [31500, 40500, 45000]
 *
 * 契約プラン変更時は MONTHLY_LIMIT と THRESHOLDS を **同時に** 更新すること。
 * 閾値の意味: 70% / 90% / 100% 到達でスタッフへアラート。
 */
const PushQuotaGuard = {
  // 2026-05-01 ライトプラン移行（docs/review_response_20260421.md §4.1 参照）
  MONTHLY_LIMIT: 15000,
  THRESHOLDS: [10500, 13500, 15000],

  _getKey: function() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return 'push_count:' + d.getFullYear() + '-' + m;
  },

  _getSent: function() {
    const key = this._getKey();
    const sheet = this._getConfigSheet();
    const data = sheet.getRange('A:B').getValues();
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] === key) return parseInt(data[i][1], 10) || 0;
    }
    return 0;
  },

  _setSent: function(count) {
    const key = this._getKey();
    const sheet = this._getConfigSheet();
    const data = sheet.getRange('A:B').getValues();
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] === key) {
        sheet.getRange(i + 1, 2).setValue(count);
        return;
      }
    }
    sheet.appendRow([key, count]);
  },

  _getConfigSheet: function() {
    const ss = SpreadsheetApp.openById(Config.spreadsheetId());
    return ss.getSheetByName(SHEETS.config) || ss.getSheetByName('Config');
  },

  canPush: function() {
    return this._getSent() < this.MONTHLY_LIMIT;
  },

  increment: function() {
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(5000);
      const newCount = this._getSent() + 1;
      this._setSent(newCount);
      this._checkAlert(newCount);
    } finally {
      lock.releaseLock();
    }
  },

  _checkAlert: function(count) {
    for (const threshold of this.THRESHOLDS) {
      if (count >= threshold && count < threshold + 2) {
        const pct = Math.round((threshold / this.MONTHLY_LIMIT) * 100);
        const msg = '[PushQuota] ' + count + '/' + this.MONTHLY_LIMIT + '通 (' + pct + '%) 到達。残り' + (this.MONTHLY_LIMIT - count) + '通。';
        LoggerService.warn(msg, {});
        this._notifyStaffByEmail(msg);
      }
    }
  },

  _notifyStaffByEmail: function(msg) {
    try {
      const email = Config.getOptional('STAFF_EMAIL', '');
      if (email) MailApp.sendEmail(email, '[Sample LINE Bot] Push通知枠アラート', msg);
    } catch (e) { LoggerService.error('email alert failed', { error: e.message }); }
  }
};
