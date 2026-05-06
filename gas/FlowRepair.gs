const FlowRepair = {
  FLOW_TYPE: 'repair',

  start: function(userId, replyToken) {
    SessionManager.start(userId, this.FLOW_TYPE);
    SessionManager.update(userId, 'step1_content', { photoUrls: [] });
    LineClient.reply(replyToken, LineClient.text('修理のご相談を承ります。どのような症状か教えてください（500文字以内）'));
  },

  handleMessage: function(userId, text, replyToken) {
    const session = SessionManager.get(userId);
    if (!session || session.flowType !== this.FLOW_TYPE) return false;
    if (text === 'メニューに戻る' || text === 'キャンセル') {
      SessionManager.clear(userId); LineClient.reply(replyToken, LineClient.text('メニューに戻りました。')); return true;
    }
    switch (session.currentStep) {
      case 'step1_content':
        if (!Security.validateFreeText(text, 500)) { LineClient.reply(replyToken, LineClient.text('500文字以内で入力してください')); return true; }
        SessionManager.update(userId, 'step2_photo', { content: Security.stripTags(text) });
        LineClient.reply(replyToken, { type: 'text', text: '写真があれば送信してください（最大3枚）。不要の場合は「スキップ」と入力', quickReply: { items: [{ type: 'action', action: { type: 'message', label: 'スキップ', text: 'スキップ' } }] } });
        return true;
      case 'step2_photo':
        if (text === 'スキップ' || text === '次へ') {
          SessionManager.update(userId, 'step3_car', {});
          LineClient.reply(replyToken, LineClient.text('お車の車種を教えてください（例: トヨタ プリウス）'));
          return true;
        }
        LineClient.reply(replyToken, LineClient.text('写真を送信するか「スキップ」を選んでください'));
        return true;
      case 'step3_car':
        if (!Security.validateFreeText(text, 100)) { LineClient.reply(replyToken, LineClient.text('100文字以内で入力してください')); return true; }
        SessionManager.update(userId, 'step4_preferred', { car: Security.stripTags(text) });
        {
          const minD = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
          const maxD2 = new Date(); maxD2.setDate(maxD2.getDate() + 90);
          const maxD2Str = Utilities.formatDate(maxD2, 'Asia/Tokyo', 'yyyy-MM-dd');
          const qrItems = ['今週中','来週中','1ヶ月以内','急がない'].map(function(l) {
            return { type: 'action', action: { type: 'message', label: l, text: l } };
          });
          LineClient.reply(replyToken, FlexMessages.datetimePicker({
            title: '希望の来店時期を教えてください',
            data: 'flow=repair&action=datetime',
            mode: 'date',
            minDate: minD,
            maxDate: maxD2Str,
            showSkip: false,
            quickReplies: qrItems
          }));
        }
        return true;
      case 'step4_preferred': {
        const TIMING = ['今週中', '来週中', '1ヶ月以内', '急がない'];
        if (TIMING.indexOf(text) === -1) { LineClient.reply(replyToken, LineClient.text('下のボタンから選ぶか、カレンダーボタンで日付を指定してください')); return true; }
        SessionManager.update(userId, 'step5_name', { preferredDate: text });
        LineClient.reply(replyToken, LineClient.text(Security.NAME_PROMPT));
        return true;
      }
      case 'step5_name': {
        const parsed = Security.parseNameAndKana(text);
        if (!parsed.ok) { LineClient.reply(replyToken, LineClient.text(Security.NAME_ERROR)); return true; }
        SessionManager.update(userId, 'step6_phone', {
          name: parsed.name + '（' + parsed.kana + '）',
          nameKanji: parsed.name,
          nameKana: parsed.kana
        });
        LineClient.reply(replyToken, LineClient.text('お電話番号を教えてください（例: 090-1234-5678）'));
        return true;
      }
      case 'step6_phone':
        if (!Security.validatePhone(text)) { LineClient.reply(replyToken, LineClient.text('電話番号は0から始まる10〜11桁でお願いします')); return true; }
        return this._finalize(userId, text, replyToken);
    }
    return false;
  },

  handleDatetimePicker: function(userId, isoDate, replyToken) {
    const session = SessionManager.get(userId);
    if (!session || session.flowType !== this.FLOW_TYPE) return false;
    if (session.currentStep !== 'step4_preferred') return false;
    const date = isoDate ? String(isoDate).slice(0, 10) : null;
    if (!date) {
      LineClient.reply(replyToken, LineClient.text('日付を取得できませんでした。もう一度お試しください。'));
      return true;
    }
    SessionManager.update(userId, 'step5_name', { preferredDate: date });
    LineClient.reply(replyToken, LineClient.text(Security.NAME_PROMPT));
    return true;
  },

  handleImage: function(userId, messageId, replyToken) {
    const session = SessionManager.get(userId);
    if (!session || session.flowType !== this.FLOW_TYPE || session.currentStep !== 'step2_photo') return false;
    const photos = session.collectedData.photoUrls || [];
    if (photos.length >= 3) { LineClient.reply(replyToken, LineClient.text('写真は3枚までです。「スキップ」で次へ進みます')); return true; }
    const url = LineClient.downloadImageToDrive(messageId);
    const updatedPhotos = photos.concat([url]);
    SessionManager.update(userId, 'step2_photo', { photoUrls: updatedPhotos });
    LineClient.reply(replyToken, LineClient.text('写真' + updatedPhotos.length + '/3 を受け取りました。追加で送るか「スキップ」で次へ'));
    return true;
  },

  _finalize: function(userId, phone, replyToken) {
    const session = SessionManager.get(userId);
    if (!session) {
      LineClient.reply(replyToken, LineClient.text('セッションの有効期限が切れました。もう一度「修理問い合わせ」からやり直してください。'));
      return true;
    }
    const d = session.collectedData;
    const id = InquiryRepo.create({
      userId: userId, type: 'repair',
      content: d.content + '\n【車種】' + d.car,
      photoUrls: d.photoUrls || [], preferredDate: d.preferredDate, phone: phone
    });
    CustomerRepo.upsert(userId, { name: d.name, nameKana: d.nameKana, phone: phone });
    SessionManager.clear(userId);
    const photoCount = (d.photoUrls || []).length;
    LineClient.reply(replyToken, FlexMessages.inquirySuccess('修理相談', '0312345678'));
    const staff = Config.getOptional('STAFF_LINE_USER_ID', '');
    if (staff) {
      LineClient.push(staff, LineClient.text(
        '🔧 新規修理相談\n' +
        '━━━━━━━━━\n' +
        'お名前: ' + d.name + '\n' +
        '車種: ' + d.car + '\n' +
        '希望時期: ' + (d.preferredDate || '-') + '\n' +
        '電話: ' + phone + '\n' +
        '写真: ' + photoCount + '枚\n' +
        '症状:\n' + (d.content || '-')
      ));
    }
    LoggerService.info('repair inquiry created', { id: id, userId: userId });
    return true;
  }
};
