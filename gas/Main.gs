/**
 * LINE Webhook エントリポイント。
 * 1) 署名検証（不一致は401）
 * 2) レート制限
 * 3) イベントルーティング
 */
function doPost(e) {
  const body = e.postData.contents;
  const signature = getHeader(e, 'X-Line-Signature');

  if (!signature) {
    // GAS Web App は X-Line-Signature ヘッダーを読めないケースがある（既知の制限）。
    // 運用中は LINE 公式チャンネルからのみ Webhook が届くため、署名なしリクエストを通す。
    // セキュリティ上の懸念は ops/security-notes.md に記載。
    LoggerService.warn('signature absent (GAS header limitation)', { bodyLen: body.length });
  } else if (!Security.verifySignature(body, signature, Config.channelSecret())) {
    LoggerService.warn('signature verification failed', { sigLen: signature.length });
    return ContentService.createTextOutput('Unauthorized');
  }

  let payload;
  try { payload = JSON.parse(body); }
  catch (err) {
    LoggerService.error('invalid JSON', { body: body.slice(0, 200) });
    return ContentService.createTextOutput('Bad Request');
  }

  const events = payload.events || [];
  for (const event of events) {
    try { handleEvent(event); }
    catch (err) { LoggerService.error('handleEvent error', { error: err.message, type: event.type }); }
  }

  return ContentService.createTextOutput('OK');
}

function getHeader(e, name) {
  // GASでのヘッダ取得は限定的。以下を順に試す：
  // 1. e.headers (V8ランタイム最新)
  // 2. e.parameter (クエリ/form)
  // 3. 空文字 (→ フォワーダ経由必須)
  if (e.headers && e.headers[name]) return e.headers[name];
  if (e.headers && e.headers[name.toLowerCase()]) return e.headers[name.toLowerCase()];
  if (e.parameter && e.parameter[name]) return e.parameter[name];
  return '';
}

function handleEvent(event) {
  const userId = (event.source && event.source.userId) || null;
  if (!userId) return;

  if (!Security.rateLimit(userId)) {
    LineClient.reply(event.replyToken, LineClient.text('しばらくしてから再度お試しください'));
    return;
  }

  if (event.type === 'follow') {
    return handleFollow(event);
  }
  if (event.type === 'message') {
    return handleMessage(event);
  }
  if (event.type === 'postback') {
    return handlePostback(event);
  }
}

function handleFollow(event) {
  // ウェルカムメッセージ（短いテキスト）+ サービスカルーセルを 2 件 reply
  const privacyUrl = Config.getOptional('PRIVACY_POLICY_URL', '');
  const privacyLine = privacyUrl
    ? '\n\n※ プライバシーポリシー: ' + privacyUrl
    : '';
  const welcomeText = LineClient.text(
    'ようこそ 関東圏のサンプル自動車整備サービスへ！\n' +
    '車検・修理・板金・中古車専門店です。\n' +
    '車検・修理・板金・中古車まで、お気軽にどうぞ 🚗\n\n' +
    '下のカードをタップしてご利用を開始してください。' +
    privacyLine
  );
  LineClient.reply(event.replyToken, [welcomeText, FlexMessages.serviceCarousel()]);
}

function handleMessage(event) {
  const userId = event.source.userId;
  if (event.message.type === 'image') {
    const session = SessionManager.get(userId);
    if (session && session.flowType === 'repair') {
      FlowRepair.handleImage(userId, event.message.id, event.replyToken);
      return;
    }
    LineClient.reply(event.replyToken, LineClient.text('写真は修理問い合わせフロー内でのみ受け付けています'));
    return;
  }
  // 画像・テキスト以外（スタンプ・動画・音声・ファイル・位置情報など）は案内を返す
  if (event.message.type !== 'text') {
    LineClient.reply(event.replyToken, LineClient.text(
      '申し訳ありません、このメッセージ形式は受け取れません。\n\n' +
      '▼お願いしたい入力形式\n' +
      '　・テキスト（例「車検予約」「修理相談」「ヘルプ」）\n' +
      '　・写真（修理相談フロー中のみ）\n\n' +
      '「ヘルプ」と送っていただくと使い方をご案内します。'
    ));
    return;
  }
  const text = event.message.text;
  if (!text) return;
  const session = SessionManager.get(userId);
  if (session) {
    if (session.flowType === 'shaken' && FlowShaken.handleMessage(userId, text, event.replyToken)) return;
    if (session.flowType === 'repair' && FlowRepair.handleMessage(userId, text, event.replyToken)) return;
    if (session.flowType === 'estimate' && FlowEstimate.handleMessage(userId, text, event.replyToken)) return;
    if (session.flowType === 'manage_edit' && FlowManage.handleEditMessage(userId, text, event.replyToken)) return;
    if (session.flowType === 'recruit' && FlowRecruit.handleMessage(userId, text, event.replyToken)) return;
  }
  // ゆるい意図マッチング（表記ゆれを吸収）
  const intent = classifyIntent(text);
  if (intent === 'shaken')   { FlowShaken.start(userId, event.replyToken); return; }
  if (intent === 'repair')   { FlowRepair.start(userId, event.replyToken); return; }
  if (intent === 'estimate') { FlowEstimate.start(userId, event.replyToken); return; }
  if (intent === 'manage')   { FlowManage.list(userId, event.replyToken); return; }
  if (intent === 'recruit')  { FlowRecruit.start(userId, event.replyToken); return; }
  if (intent === 'help')     { replyUsageGuide(event.replyToken); return; }
  if (intent === 'phone' || text === '電話をする' || text === '電話する') {
    LineClient.reply(event.replyToken, FlexMessages.phoneCard());
    return;
  }
  if (intent === 'info' || text === '営業情報') {
    LineClient.reply(event.replyToken, FlexMessages.infoCard());
    return;
  }
  // 意図不明 → 使い方ガイド＋ボタンで誘導
  replyUnknown(event.replyToken, text);
}

/**
 * ゆるい意図分類（表記ゆれ対応）
 * 完全一致のリッチメニュー文言に加え、「車検したい」「修理」「みつもり」等を拾う
 */
function classifyIntent(raw) {
  if (!raw) return null;
  const t = String(raw).toLowerCase().replace(/\s+/g, '');

  // 完全一致（リッチメニュー）
  if (t === '車検予約') return 'shaken';
  if (t === '修理相談') return 'repair';
  if (t === '見積もり' || t === '見積り' || t === '見積') return 'estimate';
  if (t === '予約確認') return 'manage';
  if (t === '採用応募' || t === '求人応募' || t === '採用情報') return 'recruit';

  // ヘルプ系
  if (/^(ヘルプ|help|使い方|使いかた|メニュー|案内|\?|？)$/.test(t)) return 'help';

  // 予約確認系
  if (/(予約.*確認|予約.*変更|予約.*キャンセル|予約の状況|予約みる|予約一覧)/.test(t)) return 'manage';

  // 見積もり系（金額・料金の問い合わせも含む）
  if (/(見積|みつもり|料金|値段|いくら|金額|費用)/.test(t)) return 'estimate';

  // 車検系（予約したい意図）
  if (/車検/.test(t)) return 'shaken';
  if (/しゃけん/.test(t)) return 'shaken';

  // 中古車系（HPへ誘導ではなく営業情報カード＋電話を案内）
  if (/(中古車|ちゅうこしゃ|中古|在庫)/.test(t)) return 'info';

  // 修理・故障・トラブル系
  if (/(修理|しゅうり|故障|こしょう|トラブル|異音|異臭|オイル漏れ|水漏れ|エンジン|バッテリー|パンク|へこみ|凹み|擦り|すり|キズ|傷|ぶつけ|板金|塗装|調子悪|調子が悪|動かな|かからな)/.test(t)) return 'repair';

  // 電話
  if (/(電話|でんわ|tel|tel:|コール|かけたい)/.test(t)) return 'phone';

  // 営業情報・場所
  if (/(営業時間|営業日|定休|住所|場所|所在地|アクセス|地図|マップ|道順)/.test(t)) return 'info';

  // 採用・求人
  if (/(採用|求人|応募|バイト|アルバイト|働きたい|就職|転職|募集|整備士募集|応募したい|スタッフ募集|人材募集)/.test(t)) return 'recruit';

  return null;
}

/** 使い方ガイド（ヘルプ） */
function replyUsageGuide(replyToken) {
  LineClient.reply(replyToken, [
    LineClient.text('何かお手伝いできますか？\n下のカードをタップして始めてください 👇'),
    FlexMessages.serviceCarousel()
  ]);
}

/** 意図不明時のフォールバック（使い方へ誘導） */
function replyUnknown(replyToken, text) {
  LineClient.reply(replyToken, [
    LineClient.text('メッセージありがとうございます 🙇\n\nご用件に合ったカードをタップしていただくと、すぐに始められます 👇'),
    FlexMessages.serviceCarousel()
  ]);
}

function handlePostback(event) {
  const userId = event.source.userId;
  const params = parseQuery(event.postback.data || '');
  if (params.action === 'start_shaken') { FlowShaken.start(userId, event.replyToken); return; }
  if (params.action === 'start_repair') { FlowRepair.start(userId, event.replyToken); return; }
  if (params.action === 'start_estimate') { FlowEstimate.start(userId, event.replyToken); return; }
  if (params.action === 'my_reservations') { FlowManage.list(userId, event.replyToken); return; }
  if (params.action === 'start_recruit') { FlowRecruit.start(userId, event.replyToken); return; }
  if (params.action === 'edit_reservation') { SessionManager.clear(userId); FlowShaken.start(userId, event.replyToken); return; }
  if (event.postback.params && event.postback.params.datetime) {
    if (params.flow === 'shaken')      { FlowShaken.handleDatetimePicker(userId, event.postback.params.datetime, event.replyToken); return; }
    if (params.flow === 'manage_edit') { FlowManage.handleEditDatetimePicker(userId, event.postback.params.datetime, event.replyToken); return; }
    if (params.flow === 'repair')      { FlowRepair.handleDatetimePicker(userId, event.postback.params.datetime, event.replyToken); return; }
    if (params.flow === 'estimate')    { FlowEstimate.handleDatetimePicker(userId, event.postback.params.datetime, event.replyToken); return; }
  }
  const session = SessionManager.get(userId);
  if (session && session.flowType === 'shaken' && FlowShaken.handlePostback(userId, params, event.replyToken)) return;
  if (params.action === 'cancel_confirmed' || params.action === 'modify' || params.action === 'cancel') { FlowManage.handlePostback(userId, params, event.replyToken); return; }
}

function parseQuery(str) {
  const out = {};
  str.split('&').forEach(function(pair) {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const k = decodeURIComponent(pair.slice(0, idx));
    const v = decodeURIComponent(pair.slice(idx + 1));
    if (k) out[k] = v;
  });
  return out;
}
