const FlowRecruit = {
  FLOW_TYPE: 'recruit',
  POSITIONS: ['整備士', '受付・事務', '営業', 'その他'],
  EXPERIENCE: ['未経験', '1〜3年', '3年以上'],

  start: function(userId, replyToken) {
    SessionManager.start(userId, this.FLOW_TYPE);
    SessionManager.update(userId, 'step1_position', {});
    LineClient.reply(replyToken, {
      type: 'text',
      text:
        '採用応募ありがとうございます！\n' +
        'まずはご希望の職種を教えてください。\n\n' +
        '※ 詳しい募集要項は、内容確認後にスタッフよりご案内いたします。',
      quickReply: {
        items: this.POSITIONS.map(function(p) {
          return { type: 'action', action: { type: 'message', label: p, text: p } };
        })
      }
    });
  },

  handleMessage: function(userId, text, replyToken) {
    const session = SessionManager.get(userId);
    if (!session || session.flowType !== this.FLOW_TYPE) return false;
    if (text === 'メニューに戻る') {
      SessionManager.clear(userId);
      LineClient.reply(replyToken, LineClient.text('メニューに戻りました'));
      return true;
    }

    switch (session.currentStep) {
      case 'step1_position':
        if (this.POSITIONS.indexOf(text) === -1) {
          LineClient.reply(replyToken, LineClient.text('下のボタンから希望職種を選んでください'));
          return true;
        }
        SessionManager.update(userId, 'step2_experience', { position: text });
        LineClient.reply(replyToken, {
          type: 'text',
          text: '自動車業界でのご経験を教えてください',
          quickReply: {
            items: this.EXPERIENCE.map(function(e) {
              return { type: 'action', action: { type: 'message', label: e, text: e } };
            })
          }
        });
        return true;

      case 'step2_experience':
        if (this.EXPERIENCE.indexOf(text) === -1) {
          LineClient.reply(replyToken, LineClient.text('下のボタンから選んでください'));
          return true;
        }
        SessionManager.update(userId, 'step3_message', { experience: text });
        LineClient.reply(replyToken, LineClient.text(
          '志望動機・自己PRを入力してください（500文字以内）。\n' +
          '特になければ「なし」とお送りください。'
        ));
        return true;

      case 'step3_message': {
        const msg = text === 'なし' ? '' : text;
        if (msg && !Security.validateFreeText(msg, 500)) {
          LineClient.reply(replyToken, LineClient.text('500文字以内で入力してください'));
          return true;
        }
        SessionManager.update(userId, 'step4_name', { message: Security.stripTags(msg) });
        LineClient.reply(replyToken, LineClient.text(Security.NAME_PROMPT));
        return true;
      }

      case 'step4_name': {
        const parsed = Security.parseNameAndKana(text);
        if (!parsed.ok) {
          LineClient.reply(replyToken, LineClient.text(Security.NAME_ERROR));
          return true;
        }
        SessionManager.update(userId, 'step5_phone', {
          name: parsed.name + '（' + parsed.kana + '）',
          nameKanji: parsed.name,
          nameKana: parsed.kana
        });
        LineClient.reply(replyToken, LineClient.text('連絡のつくお電話番号を教えてください（例: 090-1234-5678）'));
        return true;
      }

      case 'step5_phone':
        if (!Security.validatePhone(text)) {
          LineClient.reply(replyToken, LineClient.text('電話番号は0から始まる10〜11桁でお願いします'));
          return true;
        }
        return this._finalize(userId, text, replyToken);
    }
    return false;
  },

  _finalize: function(userId, phone, replyToken) {
    const session = SessionManager.get(userId);
    if (!session) {
      LineClient.reply(replyToken, LineClient.text('セッションの有効期限が切れました。もう一度「採用応募」からやり直してください。'));
      return true;
    }
    const d = session.collectedData;
    const id = RecruitRepo.create({
      userId:     userId,
      name:       d.name       || '',
      phone:      phone,
      position:   d.position   || '',
      experience: d.experience || '',
      message:    d.message    || ''
    });
    CustomerRepo.upsert(userId, { name: d.name, nameKana: d.nameKana, phone: phone });
    SessionManager.clear(userId);
    LineClient.reply(replyToken, LineClient.text(
      '採用応募ありがとうございます！\n' +
      ShopHours.replyEtaMessage() + '\n\n' +
      'お急ぎの場合はお電話でもご相談いただけます。\n' +
      '📞 03-1234-5678（9:00〜18:00／日祝休）\n\n' +
      '※ ご応募内容は採用選考の目的にのみ使用いたします。'
    ));
    const staff = Config.getOptional('STAFF_LINE_USER_ID', '');
    if (staff) {
      LineClient.push(staff, LineClient.text(
        '🧑‍🔧 新規採用応募\n' +
        '━━━━━━━━━\n' +
        'お名前: ' + d.name + '\n' +
        '希望職種: ' + d.position + '\n' +
        '経験: ' + d.experience + '\n' +
        '電話: ' + phone + '\n' +
        '志望動機: ' + (d.message || '（未記入）')
      ));
    }
    LoggerService.info('recruit inquiry created', { id: id, userId: userId });
    return true;
  }
};
