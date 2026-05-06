/**
 * Script Propertiesから設定値を取得する中央管理モジュール。
 * 全てのシークレットはここ経由でのみアクセスする。
 */
const Config = {
  get: function(key) {
    const value = PropertiesService.getScriptProperties().getProperty(key);
    if (value === null || value.trim() === '') {
      throw new Error('Missing config: ' + key);
    }
    return value;
  },
  getOptional: function(key, defaultValue) {
    const value = PropertiesService.getScriptProperties().getProperty(key);
    return value === null ? defaultValue : value;
  },
  channelSecret: function() { return this.get('LINE_CHANNEL_SECRET'); },
  channelAccessToken: function() { return this.get('LINE_CHANNEL_ACCESS_TOKEN'); },
  spreadsheetId: function() { return this.get('SPREADSHEET_ID'); },
  staffUserId: function() { return this.get('STAFF_LINE_USER_ID'); }
};
