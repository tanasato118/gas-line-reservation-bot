const SessionManager = {
  _sheet: function() {
    const ss = SpreadsheetApp.openById(Config.spreadsheetId());
    return ss.getSheetByName(SHEETS.sessions) || ss.getSheetByName('Sessions');
  },

  start: function(userId, flowType) {
    this.clear(userId);
    const now = new Date();
    this._sheet().appendRow([
      userId, flowType, 'step1', JSON.stringify({}), now, now
    ]);
    LoggerService.info('session started', { userId: userId, flowType: flowType });
  },

  get: function(userId) {
    const sheet = this._sheet();
    const data = sheet.getDataRange().getValues();
    const ttlMinutes = parseInt(Config.getOptional('sessionTtlMinutes', '30'), 10);
    const now = new Date();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === userId) {
        const lastInteraction = new Date(data[i][5]);
        if ((now - lastInteraction) > ttlMinutes * 60 * 1000) {
          sheet.deleteRow(i + 1);
          return null;
        }
        return {
          userId: data[i][0],
          flowType: data[i][1],
          currentStep: data[i][2],
          collectedData: JSON.parse(data[i][3] || '{}'),
          startedAt: data[i][4],
          lastInteractionAt: data[i][5],
          _rowIndex: i + 1
        };
      }
    }
    return null;
  },

  update: function(userId, currentStep, dataToMerge) {
    const s = this.get(userId);
    if (!s) throw new Error('no active session for ' + userId);
    const merged = Object.assign({}, s.collectedData, dataToMerge || {});
    const sheet = this._sheet();
    sheet.getRange(s._rowIndex, 3).setValue(currentStep);
    sheet.getRange(s._rowIndex, 4).setValue(JSON.stringify(merged));
    sheet.getRange(s._rowIndex, 6).setValue(new Date());
  },

  clear: function(userId) {
    const sheet = this._sheet();
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (data[i][0] === userId) sheet.deleteRow(i + 1);
    }
  },

  clearExpired: function() {
    const sheet = this._sheet();
    const data = sheet.getDataRange().getValues();
    const ttlMinutes = parseInt(Config.getOptional('sessionTtlMinutes', '30'), 10);
    const now = new Date();
    let removed = 0;
    for (let i = data.length - 1; i >= 1; i--) {
      const lastInteraction = new Date(data[i][5]);
      if ((now - lastInteraction) > ttlMinutes * 60 * 1000) {
        sheet.deleteRow(i + 1);
        removed++;
      }
    }
    LoggerService.info('expired sessions cleared', { removed: removed });
  }
};
