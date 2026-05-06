const FlowEstimate = {
  FLOW_TYPE: 'estimate',
  SERVICES: ['車検', '板金塗装', 'オイル交換', 'タイヤ交換', '中古車購入'],

  start: function(userId, replyToken) {
    SessionManager.start(userId, this.FLOW_TYPE);
    SessionManager.update(userId, 'step1_service', {});
    LineClient.reply(replyToken, {
      type: 'text',
      text: 'お見積りを承ります。どのサービスについてですか？',
      quickReply: { items: this.SERVICES.map(function(s) { return { type: 'action', action: { type: 'message', label: s, text: s } }; }) }
    });
  },

  handleMessage: function(userId, text, replyToken) {
    const session = SessionManager.get(userId);
    if (!session || session.flowType !== this.FLOW_TYPE) return false;
    if (text === 'メニューに戻る') { SessionManager.clear(userId); LineClient.reply(replyToken, LineClient.text('メニューに戻りました')); return true; }

    switch (session.currentStep) {
      case 'step1_service':
        if (this.SERVICES.indexOf(text) === -1) { LineClient.reply(replyToken, LineClient.text('下のボタンから選んでください')); return true; }
        SessionManager.update(userId, 'step2_car', { service: text });
        LineClient.reply(replyToken, LineClient.text('お車の車種を教えてください（例: トヨタ プリウス）'));
        return true;
      case 'step2_car':
        if (!Security.validateFreeText(text, 100)) { LineClient.reply(replyToken, LineClient.text('100文字以内で入力してください')); return true; }
        SessionManager.update(userId, 'step3_when', { car: Security.stripTags(text) });
        {
          const minD = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
          const maxD2 = new Date(); maxD2.setDate(maxD2.getDate() + 90);
          const maxD2Str = Utilities.formatDate(maxD2, 'Asia/Tokyo', 'yyyy-MM-dd');
          const qrItems = ['今週中','来週中','1ヶ月以内','急がない'].map(function(l) {
            return { type: 'action', action: { type: 'message', label: l, text: l } };
          });
          LineClient.reply(replyToken, FlexMessages.datetimePicker({
            title: 'いつ頃のご希望ですか？',
            data: 'flow=estimate&action=datetime',
            mode: 'date',
            minDate: minD,
            maxDate: maxD2Str,
            showSkip: false,
            quickReplies: qrItems
          }));
        }
        return true;
      case 'step3_when': {
        const TIMING = ['今週中', '来週中', '1ヶ月以内', '急がない'];
        if (TIMING.indexOf(text) === -1) { LineClient.reply(replyToken, LineClient.text('下のボタンから選ぶか、カレンダーボタンで日付を指定してください')); return true; }
        SessionManager.update(userId, 'step4_name', { preferredDate: text });
        LineClient.reply(replyToken, LineClient.text(Security.NAME_PROMPT));
        return true;
      }
      case 'step4_name': {
        const parsed = Security.parseNameAndKana(text);
        if (!parsed.ok) { LineClient.reply(replyToken, LineClient.text(Security.NAME_ERROR)); return true; }
        SessionManager.update(userId, 'step5_phone', {
          name: parsed.name + '（' + parsed.kana + '）',
          nameKanji: parsed.name,
          nameKana: parsed.kana
        });
        LineClient.reply(replyToken, LineClient.text('お電話番号を教えてください（例: 090-1234-5678）'));
        return true;
      }
      case 'step5_phone':
        if (!Security.validatePhone(text)) { LineClient.reply(replyToken, LineClient.text('電話番号は0から始まる10〜11桁でお願いします')); return true; }
        return this._finalize(userId, text, replyToken);
    }
    return false;
  },

  handleDatetimePicker: function(userId, isoDate, replyToken) {
    const session = SessionManager.get(userId);
    if (!session || session.flowType !== this.FLOW_TYPE) return false;
    if (session.currentStep !== 'step3_when') return false;
    const date = isoDate ? String(isoDate).slice(0, 10) : null;
    if (!date) {
      LineClient.reply(replyToken, LineClient.text('日付を取得できませんでした。もう一度お試しください。'));
      return true;
    }
    SessionManager.update(userId, 'step4_name', { preferredDate: date });
    LineClient.reply(replyToken, LineClient.text(Security.NAME_PROMPT));
    return true;
  },

  _finalize: function(userId, phone, replyToken) {
    const session = SessionManager.get(userId);
    if (!session) {
      LineClient.reply(replyToken, LineClient.text('セッションの有効期限が切れました。もう一度「見積もり」からやり直してください。'));
      return true;
    }
    const d = session.collectedData;
    const id = InquiryRepo.create({
      userId: userId, type: 'estimate',
      content: '【サービス】' + d.service + '\n【車種】' + d.car,
      preferredDate: d.preferredDate, phone: phone
    });
    CustomerRepo.upsert(userId, { name: d.name, nameKana: d.nameKana, phone: phone });
    SessionManager.clear(userId);
    LineClient.reply(replyToken, FlexMessages.inquirySuccess('見積もり', '0312345678'));
    const staff = Config.getOptional('STAFF_LINE_USER_ID', '');
    if (staff) {
      LineClient.push(staff, LineClient.text(
        '💰 新規見積り依頼\n' +
        '━━━━━━━━━\n' +
        'お名前: ' + d.name + '\n' +
        'サービス: ' + d.service + '\n' +
        '車種: ' + d.car + '\n' +
        '希望時期: ' + (d.preferredDate || '-') + '\n' +
        '電話: ' + phone
      ));
    }
    // 整理用の内部IDはログにのみ残す
    LoggerService.info('estimate inquiry created', { id: id, userId: userId });
    return true;
  }
};
