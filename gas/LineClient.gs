const LineClient = {
  REPLY_URL: 'https://api.line.me/v2/bot/message/reply',
  PUSH_URL: 'https://api.line.me/v2/bot/message/push',
  BROADCAST_URL: 'https://api.line.me/v2/bot/message/broadcast',

  reply: function(replyToken, messages) {
    if (!Array.isArray(messages)) messages = [messages];
    return this._call(this.REPLY_URL, { replyToken: replyToken, messages: messages });
  },

  push: function(userId, messages) {
    if (!userId) {
      LoggerService.warn('push called with null userId', {});
      return null;
    }
    if (!PushQuotaGuard.canPush()) {
      LoggerService.warn('push blocked: quota exceeded', { userId: userId });
      return null;
    }
    if (!Array.isArray(messages)) messages = [messages];
    const result = this._call(this.PUSH_URL, { to: userId, messages: messages });
    if (result && result.code < 400) {
      PushQuotaGuard.increment();
    }
    return result;
  },

  broadcast: function(messages) {
    if (!PushQuotaGuard.canPush()) {
      LoggerService.warn('broadcast blocked: quota exceeded', {});
      return null;
    }
    if (!Array.isArray(messages)) messages = [messages];
    const result = this._call(this.BROADCAST_URL, { messages: messages });
    if (result && result.code < 400) {
      PushQuotaGuard.increment();
    }
    return result;
  },

  text: function(content) {
    return { type: 'text', text: String(content).slice(0, 5000) };
  },

  _call: function(url, payload) {
    const options = {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + Config.channelAccessToken() },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    const maxRetries = 3;
    const retryableCodes = [429, 500, 502, 503, 504];
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const res = UrlFetchApp.fetch(url, options);
        const code = res.getResponseCode();
        if (retryableCodes.indexOf(code) !== -1 && attempt < maxRetries - 1) {
          const wait = Math.pow(2, attempt) * 1000;
          LoggerService.warn('LINE API retrying', { url: url, code: code, attempt: attempt + 1, waitMs: wait });
          Utilities.sleep(wait);
          continue;
        }
        if (code >= 400) {
          LoggerService.error('LINE API error', { url: url, code: code, body: res.getContentText().slice(0, 200), attempt: attempt + 1 });
        }
        return { code: code, body: res.getContentText() };
      } catch (e) {
        if (attempt < maxRetries - 1) {
          const wait = Math.pow(2, attempt) * 1000;
          LoggerService.warn('LINE API fetch error, retrying', { url: url, error: e.message, attempt: attempt + 1 });
          Utilities.sleep(wait);
        } else {
          LoggerService.error('LINE API fetch failed after retries', { url: url, error: e.message });
          throw e;
        }
      }
    }
    return null;
  }
};

LineClient.downloadImageToDrive = function(messageId) {
  const url = 'https://api-data.line.me/v2/bot/message/' + messageId + '/content';
  const options = { headers: { 'Authorization': 'Bearer ' + Config.channelAccessToken() }, muteHttpExceptions: true };
  const res = UrlFetchApp.fetch(url, options);
  const blob = res.getBlob().setName('line_' + messageId + '.jpg');
  const folderId = Config.getOptional('PHOTO_FOLDER_ID', '');
  const folder = folderId ? DriveApp.getFolderById(folderId) : DriveApp.getRootFolder();
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  return file.getUrl();
};
