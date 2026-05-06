function setupRichMenu() {
  const payload = {
    size: { width: 2500, height: 1686 },
    selected: true,
    name: 'Sample LINE Bot main menu',
    chatBarText: 'メニュー',
    areas: [
      { bounds: { x: 0,    y: 0,   width: 833, height: 843 }, action: { type: 'postback', data: 'action=start_shaken',   displayText: '車検予約' } },
      { bounds: { x: 833,  y: 0,   width: 834, height: 843 }, action: { type: 'postback', data: 'action=start_repair',   displayText: '修理問い合わせ' } },
      { bounds: { x: 1667, y: 0,   width: 833, height: 843 }, action: { type: 'postback', data: 'action=start_estimate', displayText: '見積もり' } },
      { bounds: { x: 0,    y: 843, width: 833, height: 843 }, action: { type: 'postback', data: 'action=my_reservations', displayText: '予約確認' } },
      { bounds: { x: 833,  y: 843, width: 834, height: 843 }, action: { type: 'postback', data: 'action=start_recruit', displayText: '採用応募' } },
      { bounds: { x: 1667, y: 843, width: 833, height: 843 }, action: { type: 'uri',      uri: 'tel:0312345678' } }
    ]
  };

  const token = Config.channelAccessToken();
  const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/richmenu', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const body = res.getContentText();
  if (res.getResponseCode() !== 200) {
    LoggerService.error('setupRichMenu failed', { code: res.getResponseCode(), body: body });
    console.log('ERROR: ' + body);
    return;
  }

  const richMenuId = JSON.parse(body).richMenuId;
  console.log('richMenuId: ' + richMenuId);
  console.log('次の手順:');
  console.log('1. LINE公式管理画面 (manager.line.biz) でリッチメニュー画像をアップロード');
  console.log('2. デフォルトに設定して全友だちに公開');
}

function deleteAllRichMenus() {
  const token = Config.channelAccessToken();
  const listRes = UrlFetchApp.fetch('https://api.line.me/v2/bot/richmenu/list', {
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  });
  const menus = JSON.parse(listRes.getContentText()).richmenus || [];
  menus.forEach(function(m) {
    UrlFetchApp.fetch('https://api.line.me/v2/bot/richmenu/' + m.richMenuId, {
      method: 'delete',
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    });
    console.log('deleted: ' + m.richMenuId);
  });
}
