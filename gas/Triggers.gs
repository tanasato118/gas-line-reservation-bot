const Triggers = {
  /** 日付値（Date・文字列）を 'yyyy-MM-dd' に統一 */
  _fmtDate: function(v) {
    if (!v) return '';
    if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
    return String(v).slice(0, 10);
  },

  /** 時刻値（Date・シリアル・文字列）を 'HH:mm' に統一 */
  _fmtTime: function(v) {
    if (!v && v !== 0) return '';
    if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'HH:mm');
    if (typeof v === 'number') {
      const totalMin = Math.round(v * 24 * 60);
      return ('0' + Math.floor(totalMin / 60)).slice(-2) + ':' + ('0' + (totalMin % 60)).slice(-2);
    }
    return String(v);
  },

  dailyReminder: function() {
    const pending = ReservationRepo.findTomorrowPending();
    LoggerService.info('daily reminder start', { count: pending.length });
    if (pending.length > 10) {
      LineClient.broadcast(LineClient.text('明日ご予約のお客様、お待ちしております。時間・内容の変更は「予約確認」からどうぞ。'));
      pending.forEach(function(r) { ReservationRepo.markReminderSent(r._rowIndex); });
      return;
    }
    for (let i = 0; i < pending.length; i++) {
      const r = pending[i];
      if (!PushQuotaGuard.canPush()) { LoggerService.warn('reminder skipped: quota', {}); break; }
      LineClient.push(r.userId, LineClient.text('明日 ' + r.reservationDate + ' ' + r.reservationTime + ' のご予約をお待ちしております。\n変更・キャンセルは「予約確認」メニューから可能です。'));
      ReservationRepo.markReminderSent(r._rowIndex);
    }
  },

  /** 当日予約の2時間前リマインド（hourlySessionCleanup から呼ばれる） */
  twoHourReminder: function() {
    const sheet = SpreadsheetApp.openById(Config.spreadsheetId())
      .getSheetByName(SHEETS.reservations) || SpreadsheetApp.openById(Config.spreadsheetId()).getSheetByName('Reservations');
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();

    const now = new Date();
    const todayStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyyMMdd');
    // Script Propertiesで当日分の送信済みIDを管理（翌日以降は自動的に無効）
    const remindedKey = 'TWO_HOUR_REMINDED_' + todayStr;
    const props = PropertiesService.getScriptProperties();
    let alreadyReminded;
    try { alreadyReminded = JSON.parse(props.getProperty(remindedKey) || '[]'); }
    catch (e) { alreadyReminded = []; }

    const windowStart = new Date(now.getTime() + 90 * 60 * 1000);   // +1.5h
    const windowEnd   = new Date(now.getTime() + 150 * 60 * 1000);  // +2.5h

    let sent = false;
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const status = String(row[12] || '');
      if (status !== STATUS.confirmed && status !== 'confirmed') continue;

      const reservationId = String(row[0] || '');
      if (!reservationId || alreadyReminded.indexOf(reservationId) !== -1) continue;

      try {
        const resD = row[9] instanceof Date ? row[9] : new Date(String(row[9]));
        const dateStr = Utilities.formatDate(resD, 'Asia/Tokyo', 'yyyy-MM-dd');
        const timeStr = String(row[10] || '09:00').slice(0, 5);
        const resDateTime = new Date(dateStr + 'T' + timeStr + ':00+09:00');
        if (isNaN(resDateTime.getTime())) continue;
        if (resDateTime < windowStart || resDateTime > windowEnd) continue;
      } catch (e) { continue; }

      const userId = String(row[2] || '');
      if (!userId) continue;
      if (!PushQuotaGuard.canPush()) { LoggerService.warn('2h reminder skipped: quota', {}); break; }

      // LineClient.push() が内部で PushQuotaGuard.increment() を呼ぶため二重加算しない
      LineClient.push(userId, LineClient.text(
        '⏰ 本日のご予約まであと約2時間です。\n\n' +
        '【' + this._fmtDate(row[9]) + ' ' + this._fmtTime(row[10]) + '】\n' +
        row[11] + ' のご予約\n\n' +
        'ご変更・キャンセルは「予約確認」から、\nお急ぎは 📞 03-1234-5678 まで。'
      ));
      alreadyReminded.push(reservationId);
      sent = true;
    }
    if (sent) props.setProperty(remindedKey, JSON.stringify(alreadyReminded));
  },

  weeklySlotGeneration: function() {
    const added = SlotRepository.generateWeekly(2);
    LoggerService.info('weekly slot generation', { added: added });
  },

  hourlySessionCleanup: function() {
    SessionManager.clearExpired();
    this.twoHourReminder();
  },

  monthlyArchive: function() {
    LoggerService.info('monthly archive executed', {});
  },

  weeklyBackup: function() {
    const ss = SpreadsheetApp.openById(Config.spreadsheetId());
    const folderId = Config.getOptional('BACKUP_FOLDER_ID', '');
    if (!folderId) { LoggerService.warn('backup skipped: no folder', {}); return; }
    const folder = DriveApp.getFolderById(folderId);
    const copy = ss.copy('Sample-Backup-' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd-HHmm'));
    const backupFile = DriveApp.getFileById(copy.getId());
    folder.addFile(backupFile);
    DriveApp.getRootFolder().removeFile(backupFile);
    LoggerService.info('weekly backup completed', { fileId: copy.getId() });
  },

  /** スタッフ向け朝の予約サマリー（毎朝8時） */
  morningBriefing: function() {
    const staff = Config.getOptional('STAFF_LINE_USER_ID', '');
    if (!staff) return;
    const ss = SpreadsheetApp.openById(Config.spreadsheetId());
    const sheet = ss.getSheetByName(SHEETS.reservations) || ss.getSheetByName('Reservations');
    if (!sheet) return;

    const data = sheet.getDataRange().getValues();
    const todayStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
    const todayDisplay = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'M月d日（E）');

    const items = [];
    for (let i = 1; i < data.length; i++) {
      try {
        const resD = data[i][9] instanceof Date ? data[i][9] : new Date(String(data[i][9]));
        const d = Utilities.formatDate(resD, 'Asia/Tokyo', 'yyyy-MM-dd');
        if (d !== todayStr) continue;
      } catch (e) { continue; }
      const status = String(data[i][12] || '');
      if (status !== STATUS.confirmed && status !== 'confirmed') continue;
      items.push({ time: this._fmtTime(data[i][10]), name: String(data[i][3] || '-'), service: String(data[i][11] || '-') });
    }
    items.sort(function(a, b) { return a.time < b.time ? -1 : 1; });

    let msg = '🌅 本日のご予約 ' + todayDisplay + '\n' + '─'.repeat(16) + '\n';
    if (items.length === 0) {
      msg += '本日の予約はありません。';
    } else {
      msg += '計 ' + items.length + ' 件\n\n';
      items.forEach(function(r) { msg += r.time + '　' + r.service + '　' + r.name + '\n'; });
    }
    // LineClient.push() 内で canPush/increment を自動実行
    LineClient.push(staff, LineClient.text(msg));
    LoggerService.info('morning briefing sent', { count: items.length });
  },

  /** 車検11ヶ月リマインド（毎月1日10時） */
  shakenReminder: function() {
    const ss = SpreadsheetApp.openById(Config.spreadsheetId());
    const sheet = ss.getSheetByName(SHEETS.reservations) || ss.getSheetByName('Reservations');
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();

    const now = new Date();
    const elevenMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const targetYYYYMM = Utilities.formatDate(elevenMonthsAgo, 'Asia/Tokyo', 'yyyy-MM');

    const reminded = [];
    for (let i = 1; i < data.length; i++) {
      const serviceType = String(data[i][11] || '');
      const status = String(data[i][12] || '');
      if (serviceType !== '車検') continue;
      if (status !== STATUS.completed && status !== 'completed') continue;

      let resYYYYMM;
      try {
        const resD = data[i][9] instanceof Date ? data[i][9] : new Date(String(data[i][9]));
        resYYYYMM = Utilities.formatDate(resD, 'Asia/Tokyo', 'yyyy-MM');
      } catch (e) { continue; }
      if (resYYYYMM !== targetYYYYMM) continue;

      const userId = String(data[i][2] || '');
      if (!userId || reminded.indexOf(userId) !== -1) continue;
      reminded.push(userId);

      if (!PushQuotaGuard.canPush()) { LoggerService.warn('shaken reminder skipped: quota', {}); break; }
      // LineClient.push() 内部で increment されるため呼出側では実施しない
      LineClient.push(userId, LineClient.text(
        '【車検のご案内】\n\n' +
        'お車の車検からおよそ11ヶ月が経ちました。\n' +
        '車検の有効期限が近づいています。\n\n' +
        '「車検予約」からお気軽にご予約ください。\n\n' +
        '📞 お急ぎの方：03-1234-5678\n' +
        '（9:00〜18:00／日祝休）'
      ));
    }
    LoggerService.info('shaken 11mo reminder sent', { count: reminded.length });
  }
};

function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) { ScriptApp.deleteTrigger(t); });
  // 時刻ベース 7 本
  ScriptApp.newTrigger('Triggers_morningBriefing').timeBased().atHour(8).everyDays(1).create();
  ScriptApp.newTrigger('Triggers_dailyReminder').timeBased().atHour(20).everyDays(1).create();
  ScriptApp.newTrigger('Triggers_weeklySlotGeneration').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(2).create();
  ScriptApp.newTrigger('Triggers_hourlySessionCleanup').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('Triggers_monthlyArchive').timeBased().onMonthDay(1).atHour(3).create();
  ScriptApp.newTrigger('Triggers_shakenReminder').timeBased().onMonthDay(1).atHour(10).create();
  ScriptApp.newTrigger('Triggers_weeklyBackup').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(3).create();
  // スプレッドシート編集 1 本
  const ss = SpreadsheetApp.openById(Config.spreadsheetId());
  ScriptApp.newTrigger('Triggers_onSheetEdit').forSpreadsheet(ss).onEdit().create();
  console.log('8 triggers installed');
}

/**
 * スタッフがスプレッドシートを直接編集した際に発火。
 * 「状態」列が「キャンセル」「完了」に変わった時にユーザーへ通知。
 * 完了時はクチコミ依頼も送付。
 */
function Triggers_onSheetEdit(e) {
  try {
    if (!e || !e.range) return;
    const sheet = e.range.getSheet();
    if (sheet.getName() !== SHEETS.reservations) return;
    if (e.range.getColumn() !== 13) return;

    const newVal = String(e.value || '').trim();
    if (newVal !== STATUS.cancelled && newVal !== STATUS.completed) return;

    const row = e.range.getRow();
    const data = sheet.getRange(row, 1, 1, 13).getValues()[0];
    const userId = data[2];
    const reservationId = data[0];
    const reservationDate = Triggers._fmtDate(data[9]);
    const reservationTime = Triggers._fmtTime(data[10]);
    if (!userId) return;

    let msg;
    if (newVal === STATUS.cancelled) {
      msg = '【予約キャンセル通知】\n\n' +
        '以下のご予約がスタッフによりキャンセルされました。\n\n' +
        '【' + reservationDate + ' ' + reservationTime + '】\n\n' +
        'ご不明の点はお電話（03-1234-5678）でご連絡ください。';
    } else {
      const reviewUrl = Config.getOptional('GOOGLE_MAPS_REVIEW_URL', '');
      msg = '【ご来店ありがとうございます】\n\n' +
        '本日の作業が完了しました。\n\n' +
        '【' + reservationDate + ' ' + reservationTime + '】\n\n' +
        'またのご利用をお待ちしております。';
      if (reviewUrl) {
        msg += '\n\n⭐ よろしければ、Googleクチコミをいただけると大変励みになります。\n' + reviewUrl;
      }
    }

    // LineClient.push() 内部で canPush チェックと increment を自動実行（二重加算防止）
    LineClient.push(userId, LineClient.text(msg));
  } catch (err) {
    LoggerService.error('onSheetEdit error', { error: err.message });
  }
}

function Triggers_dailyReminder() { Triggers.dailyReminder(); }
function Triggers_weeklySlotGeneration() { Triggers.weeklySlotGeneration(); }
function Triggers_hourlySessionCleanup() { Triggers.hourlySessionCleanup(); }
function Triggers_monthlyArchive() { Triggers.monthlyArchive(); }
function Triggers_weeklyBackup() { Triggers.weeklyBackup(); }
function Triggers_morningBriefing() { Triggers.morningBriefing(); }
function Triggers_shakenReminder() { Triggers.shakenReminder(); }
