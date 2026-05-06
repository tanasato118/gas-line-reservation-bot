const CustomerRepo = {
  _sheet: function() {
    const ss = SpreadsheetApp.openById(Config.spreadsheetId());
    return ss.getSheetByName(SHEETS.customers) || ss.getSheetByName('Customers');
  },

  upsert: function(userId, data) {
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(5000);
      const sheet = this._sheet();
      const rows = sheet.getDataRange().getValues();
      const now = new Date();
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] === userId) {
          sheet.getRange(i + 1, 3).setValue(Security.sanitizeForSheet(data.name || rows[i][2]));
          sheet.getRange(i + 1, 4).setValue(Security.sanitizeForSheet(data.phone || rows[i][3]));
          sheet.getRange(i + 1, 5).setValue(Security.sanitizeForSheet(data.carMake || rows[i][4]));
          sheet.getRange(i + 1, 6).setValue(Security.sanitizeForSheet(data.carModel || rows[i][5]));
          sheet.getRange(i + 1, 7).setValue(Security.sanitizeForSheet(data.licensePlate || rows[i][6]));
          if (data.nameKana) sheet.getRange(i + 1, 8).setValue(Security.sanitizeForSheet(data.nameKana));
          sheet.getRange(i + 1, 10).setValue(now);
          sheet.getRange(i + 1, 11).setValue((rows[i][10] || 0) + 1);
          return;
        }
      }
      sheet.appendRow(Security.sanitizeRow([
        userId, data.lineDisplayName || '', data.name || '', data.phone || '',
        data.carMake || '', data.carModel || '', data.licensePlate || '',
        data.nameKana || '', now, now, 1
      ]));
    } finally {
      lock.releaseLock();
    }
  },

  get: function(userId) {
    const rows = this._sheet().getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === userId) return {
        userId: rows[i][0], lineDisplayName: rows[i][1],
        name: rows[i][2], phone: rows[i][3],
        carMake: rows[i][4], carModel: rows[i][5], licensePlate: rows[i][6],
        firstVisit: rows[i][7], lastVisit: rows[i][8], totalCount: rows[i][9]
      };
    }
    return null;
  },

  deleteByUserId: function(userId) {
    const sheet = this._sheet();
    const rows = sheet.getDataRange().getValues();
    for (let i = rows.length - 1; i >= 1; i--) {
      if (rows[i][0] === userId) sheet.deleteRow(i + 1);
    }
  }
};
