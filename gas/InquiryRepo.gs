const InquiryRepo = {
  _sheet: function() {
    const ss = SpreadsheetApp.openById(Config.spreadsheetId());
    return ss.getSheetByName(SHEETS.inquiries) || ss.getSheetByName('Inquiries');
  },

  create: function(data) {
    const id = Utilities.getUuid().slice(0, 8);
    const row = Security.sanitizeRow([
      id, new Date(), data.userId,
      data.type, data.content || '', (data.photoUrls || []).join(','),
      data.preferredDate || '', data.phone || '',
      STATUS.new, ''
    ]);
    this._sheet().appendRow(row);
    LoggerService.info('inquiry created', { inquiryId: id, type: data.type });
    return id;
  },

  findByUserId: function(userId) {
    const data = this._sheet().getDataRange().getValues();
    const result = [];
    for (let i = 1; i < data.length; i++) {
      if (data[i][2] === userId) {
        result.push({
          inquiryId: data[i][0], createdAt: data[i][1], userId: data[i][2],
          type: data[i][3], content: data[i][4], photoUrls: data[i][5],
          preferredDate: data[i][6], phone: data[i][7], status: data[i][8]
        });
      }
    }
    return result;
  }
};
