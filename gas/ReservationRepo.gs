const ReservationRepo = {
  /** 日付値（Date・文字列・数値）を 'yyyy-MM-dd' 文字列に統一 */
  _fmtDate: function(v) {
    if (!v) return '';
    if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
    return String(v).slice(0, 10);
  },

  /** 時刻値（Date・時刻シリアル・文字列）を 'HH:mm' 文字列に統一 */
  _fmtTime: function(v) {
    if (!v && v !== 0) return '';
    if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'HH:mm');
    if (typeof v === 'number') {
      const totalMin = Math.round(v * 24 * 60);
      return ('0' + Math.floor(totalMin / 60)).slice(-2) + ':' + ('0' + (totalMin % 60)).slice(-2);
    }
    return String(v);
  },

  /** 互換関数：新しい日本語名を優先し、旧英語名にもフォールバック */
  _sheet: function() {
    const ss = SpreadsheetApp.openById(Config.spreadsheetId());
    return ss.getSheetByName(SHEETS.reservations) || ss.getSheetByName('Reservations');
  },

  /** 状態値の互換判定（日本語／英語どちらでも「確定」とみなす） */
  _isConfirmed: function(v) { return v === STATUS.confirmed || v === 'confirmed'; },

  create: function(data) {
    const id = Utilities.getUuid().slice(0, 8);
    const now = new Date();
    // 電話番号: ハイフン形式に変換し、Google Sheets の数値変換による先頭ゼロ消失を防ぐ
    const rawPhone = String(data.phone || '').replace(/\D/g, '');
    let phone;
    if (rawPhone.length === 11) {
      phone = rawPhone.slice(0, 3) + '-' + rawPhone.slice(3, 7) + '-' + rawPhone.slice(7);
    } else if (rawPhone.length === 10) {
      phone = rawPhone.slice(0, 3) + '-' + rawPhone.slice(3, 6) + '-' + rawPhone.slice(6);
    } else {
      phone = data.phone;
    }
    const row = Security.sanitizeRow([
      id, now, data.userId,
      data.customerName, phone,
      data.carMake, data.carModel, data.licensePlate, data.firstRegYear,
      data.reservationDate, data.reservationTime,
      data.serviceType, STATUS.confirmed, data.notes || '', ''
    ]);
    this._sheet().appendRow(row);
    LoggerService.info('reservation created', { reservationId: id, userId: data.userId });
    return id;
  },

  findByUserId: function(userId) {
    const data = this._sheet().getDataRange().getValues();
    const result = [];
    for (let i = 1; i < data.length; i++) {
      if (data[i][2] === userId && this._isConfirmed(data[i][12])) {
        result.push({
          reservationId: data[i][0], createdAt: data[i][1], userId: data[i][2],
          customerName: data[i][3], phone: data[i][4],
          carMake: data[i][5], carModel: data[i][6], licensePlate: data[i][7], firstRegYear: data[i][8],
          reservationDate: this._fmtDate(data[i][9]), reservationTime: this._fmtTime(data[i][10]),
          serviceType: data[i][11], status: data[i][12],
          _rowIndex: i + 1
        });
      }
    }
    return result;
  },

  findTomorrowPending: function() {
    const data = this._sheet().getDataRange().getValues();
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const tmr = Utilities.formatDate(tomorrow, 'Asia/Tokyo', 'yyyy-MM-dd');
    const result = [];
    for (let i = 1; i < data.length; i++) {
      const d = Utilities.formatDate(new Date(data[i][9]), 'Asia/Tokyo', 'yyyy-MM-dd');
      if (d === tmr && this._isConfirmed(data[i][12]) && !data[i][14]) {
        result.push({ reservationId: data[i][0], userId: data[i][2], reservationDate: this._fmtDate(data[i][9]), reservationTime: this._fmtTime(data[i][10]), _rowIndex: i + 1 });
      }
    }
    return result;
  },

  markReminderSent: function(rowIndex) {
    this._sheet().getRange(rowIndex, 15).setValue(new Date());
  },

  cancel: function(reservationId) {
    const data = this._sheet().getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === reservationId) {
        this._sheet().getRange(i + 1, 13).setValue(STATUS.cancelled);
        return { date: this._fmtDate(data[i][9]), time: this._fmtTime(data[i][10]) };
      }
    }
    return null;
  },

  updateDateTime: function(reservationId, newDate, newTime) {
    const sheet = this._sheet();
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === reservationId) {
        sheet.getRange(i + 1, 10).setValue(newDate);
        sheet.getRange(i + 1, 11).setValue(newTime);
        // リマインドフラグをリセット（変更後の日付で再通知）
        sheet.getRange(i + 1, 15).setValue('');
        LoggerService.info('reservation updated', { reservationId: reservationId, newDate: newDate, newTime: newTime });
        return true;
      }
    }
    return false;
  }
};
