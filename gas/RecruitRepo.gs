const RecruitRepo = {
  _sheet: function() {
    const ss = SpreadsheetApp.openById(Config.spreadsheetId());
    return ss.getSheetByName(SHEETS.recruit) || ss.getSheetByName('採用応募');
  },

  /**
   * 採用応募を1行保存する。
   * 列順: 応募ID / 登録日時 / LINE ユーザーID / お名前 / 電話番号
   *       / 希望職種 / 経験年数 / 志望動機 / 対応状況 / 備考
   */
  create: function(data) {
    const id = Utilities.getUuid().slice(0, 8);
    const row = Security.sanitizeRow([
      id, new Date(), data.userId,
      data.name     || '',
      data.phone    || '',
      data.position || '',
      data.experience || '',
      data.message  || '',
      STATUS.new, ''
    ]);
    this._sheet().appendRow(row);
    LoggerService.info('recruit application created', { recruitId: id, userId: data.userId });
    return id;
  }
};
