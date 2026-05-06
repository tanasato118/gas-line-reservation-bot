const SlotRepository = {
  _sheet: function() {
    const ss = SpreadsheetApp.openById(Config.spreadsheetId());
    return ss.getSheetByName(SHEETS.slots) || ss.getSheetByName('Slots');
  },

  /**
   * スプレッドシートから読んだ時刻値を 'HH:mm' 文字列に統一する。
   * Google Sheets は '13:00' を時刻シリアル値（例: 0.5416...）や Date に変換するため、
   * getValues() で読むと文字列 '13:00' と一致しなくなる。このメソッドで正規化する。
   */
  _timeStr: function(v) {
    if (!v && v !== 0) return '';
    if (v instanceof Date) {
      return Utilities.formatDate(v, 'Asia/Tokyo', 'HH:mm');
    }
    if (typeof v === 'number') {
      // 時刻シリアル: 1日の分数（例: 13:00 = 13/24 = 0.5416...）
      const totalMin = Math.round(v * 24 * 60);
      return ('0' + Math.floor(totalMin / 60)).slice(-2) + ':' + ('0' + (totalMin % 60)).slice(-2);
    }
    return String(v);
  },

  /**
   * ユーザー選択時刻をスロット間隔に最近傍スナップする。
   * 例: interval=60, 12:30 → 13:00 / 12:15 → 12:00
   */
  snapTime: function(timeStr) {
    const interval = parseInt(Config.getOptional('slotInterval', '60'), 10);
    const parts = String(timeStr).split(':');
    const totalMin = parseInt(parts[0], 10) * 60 + parseInt(parts[1] || '0', 10);
    const snapped = Math.round(totalMin / interval) * interval;
    return ('0' + Math.floor(snapped / 60)).slice(-2) + ':' + ('0' + (snapped % 60)).slice(-2);
  },

  findAvailable: function(dateFrom, dateTo) {
    const sheet = this._sheet();
    const data = sheet.getDataRange().getValues();
    const result = [];
    for (let i = 1; i < data.length; i++) {
      const d = new Date(data[i][0]);
      const capacity = data[i][2];
      const booked = data[i][3];
      if (d >= dateFrom && d <= dateTo && booked < capacity) {
        result.push({ date: data[i][0], time: data[i][1], capacity: capacity, booked: booked, _rowIndex: i + 1 });
      }
    }
    return result;
  },

  reserveWithLock: function(date, time) {
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sheet = this._sheet();
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        const sameDate = Utilities.formatDate(new Date(data[i][0]), 'Asia/Tokyo', 'yyyy-MM-dd') === Utilities.formatDate(new Date(date), 'Asia/Tokyo', 'yyyy-MM-dd');
        const sameTime = this._timeStr(data[i][1]) === String(time);
        if (sameDate && sameTime) {
          if (data[i][3] >= data[i][2]) return { ok: false, reason: 'full' };
          sheet.getRange(i + 1, 4).setValue(data[i][3] + 1);
          return { ok: true };
        }
      }
      return { ok: false, reason: 'not_found' };
    } finally {
      lock.releaseLock();
    }
  },

  releaseWithLock: function(date, time) {
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sheet = this._sheet();
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        const sameDate = Utilities.formatDate(new Date(data[i][0]), 'Asia/Tokyo', 'yyyy-MM-dd') === Utilities.formatDate(new Date(date), 'Asia/Tokyo', 'yyyy-MM-dd');
        const sameTime = this._timeStr(data[i][1]) === String(time);
        if (sameDate && sameTime && data[i][3] > 0) {
          sheet.getRange(i + 1, 4).setValue(data[i][3] - 1);
          return { ok: true };
        }
      }
      return { ok: false };
    } finally {
      lock.releaseLock();
    }
  },

  generateWeekly: function(weeksAhead) {
    weeksAhead = weeksAhead || 2;
    const sheet = this._sheet();
    const openTime = Config.getOptional('openTime', '09:00');
    const closeTime = Config.getOptional('closeTime', '18:00');
    const closedDays = Config.getOptional('closedDays', '日,祝').split(',');
    const interval = parseInt(Config.getOptional('slotInterval', '60'), 10);
    const capacity = parseInt(Config.getOptional('defaultCapacity', '1'), 10);

    // 固定休業日: Config「holidays」に「1/1,1/2,1/3,8/13,8/14,8/15,12/31」の形式で設定
    const holidayStr = Config.getOptional('holidays', '1/1,1/2,1/3,8/13,8/14,8/15,12/29,12/30,12/31');
    const holidaySet = new Set(holidayStr.split(',').map(function(s) { return s.trim(); }));

    const existingKeys = new Set();
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const d = Utilities.formatDate(new Date(data[i][0]), 'Asia/Tokyo', 'yyyy-MM-dd');
      existingKeys.add(d + '|' + this._timeStr(data[i][1]));
    }

    const rows = [];
    const start = new Date();
    const end = new Date();
    end.setDate(start.getDate() + 7 * weeksAhead);
    const dayLabels = ['日','月','火','水','木','金','土'];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dayLabel = dayLabels[d.getDay()];
      if (closedDays.includes(dayLabel)) continue;
      // 固定休業日チェック（MM/DDフォーマットで比較）
      const mmdd = (d.getMonth() + 1) + '/' + d.getDate();
      if (holidaySet.has(mmdd)) continue;
      const [oh] = openTime.split(':').map(Number);
      const [ch] = closeTime.split(':').map(Number);
      for (let h = oh; h < ch; h += interval / 60) {
        const t = ('0' + Math.floor(h)).slice(-2) + ':' + ('0' + Math.round((h % 1) * 60)).slice(-2);
        const dstr = Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
        const key = dstr + '|' + t;
        if (!existingKeys.has(key)) rows.push([dstr, t, capacity, 0, true]);
      }
    }

    if (rows.length > 0) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
    LoggerService.info('slots generated', { added: rows.length });
    return rows.length;
  }
};
