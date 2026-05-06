/**
 * 車検予約フロー（第1〜第3希望制）。
 * ステップ遷移:
 *   step1_confirm_car  (既存顧客のみ)
 *   step1_car
 *   step2_plate
 *   step3_datetime_1  (第1希望・必須)
 *   step3_datetime_2  (第2希望・スキップ可)
 *   step3_datetime_3  (第3希望・スキップ可)
 *   step4_name
 *   step4_phone
 *   step3_datetime_result  (確認画面表示後)
 *
 * 予約確定時は希望順に SlotRepository.reserveWithLock を試行し、
 * 最初に成功したものを採用する。全て埋まっていれば案内して終了。
 */
const FlowShaken = {
  FLOW_TYPE: 'shaken',
  MAX_PREFS: 3,

  start: function(userId, replyToken) {
    SessionManager.start(userId, this.FLOW_TYPE);
    const existing = CustomerRepo.get(userId);
    if (existing && existing.carModel) {
      SessionManager.update(userId, 'step1_confirm_car', {});
      LineClient.reply(replyToken, {
        type: 'text',
        text: '前回と同じお車（' + existing.carMake + ' ' + existing.carModel + '）でよろしいですか？',
        quickReply: { items: [
          { type: 'action', action: { type: 'postback', label: 'はい', data: 'action=flow&step=confirm_car&v=yes' } },
          { type: 'action', action: { type: 'postback', label: 'いいえ（別の車）', data: 'action=flow&step=confirm_car&v=no' } }
        ] }
      });
    } else {
      SessionManager.update(userId, 'step1_car', {});
      LineClient.reply(replyToken, LineClient.text('車検するお車のメーカー・車種を教えてください（例: トヨタ プリウス）'));
    }
  },

  handleMessage: function(userId, text, replyToken) {
    const session = SessionManager.get(userId);
    if (!session || session.flowType !== this.FLOW_TYPE) return false;
    if (text === 'メニューに戻る' || text === 'キャンセル') {
      SessionManager.clear(userId);
      LineClient.reply(replyToken, LineClient.text('メニューに戻りました。'));
      return true;
    }
    switch (session.currentStep) {
      case 'step1_car':          return this._handleCar(userId, text, replyToken);
      case 'step2_plate':        return this._handlePlate(userId, text, replyToken);
      case 'step3_datetime_1':
      case 'step3_datetime_2':
      case 'step3_datetime_3':   return this._handleDatetimeText(userId, text, replyToken);
      case 'step4_name':         return this._handleName(userId, text, replyToken);
      case 'step4_phone':        return this._handlePhone(userId, text, replyToken);
      case 'step3_datetime_result': {
        // 確認カード表示後にテキストが来た場合のフォールバック。
        // カードが流れてしまったユーザー向けに、もう一度カードを返す。
        const data = SessionManager.get(userId).collectedData;
        LineClient.reply(replyToken, [
          LineClient.text('下のカードの「予約する」をタップすると予約が確定します。\nやり直す場合は「キャンセル」と送ってください。'),
          FlexMessages.reservationConfirm(data)
        ]);
        return true;
      }
    }
    return false;
  },

  handlePostback: function(userId, params, replyToken) {
    const session = SessionManager.get(userId);
    if (!session || session.flowType !== this.FLOW_TYPE) return false;

    if (session.currentStep === 'step1_confirm_car' && params.step === 'confirm_car') {
      if (params.v === 'yes') {
        const c = CustomerRepo.get(userId);
        SessionManager.update(userId, 'step2_plate', { carMake: c.carMake, carModel: c.carModel });
        this._promptPlate(replyToken);
      } else {
        SessionManager.update(userId, 'step1_car', {});
        LineClient.reply(replyToken, LineClient.text('車検するお車のメーカー・車種を教えてください（例: トヨタ プリウス）'));
      }
      return true;
    }

    // スキップ（第2・第3希望を入れない）→ 名前入力へ進む
    if (params.action === 'skip_pref' && /^step3_datetime_[23]$/.test(session.currentStep)) {
      return this._advanceAfterPref(userId, replyToken);
    }

    if (session.currentStep === 'step3_datetime_result' && params.action === 'confirm_reservation') {
      return this._confirmReservation(userId, replyToken);
    }
    if (params.action === 'edit_reservation') {
      SessionManager.clear(userId);
      LineClient.reply(replyToken, LineClient.text('最初からやり直します。「車検予約」をもう一度タップしてください。'));
      return true;
    }
    return false;
  },

  handleDatetimePicker: function(userId, isoDate, replyToken) {
    const session = SessionManager.get(userId);
    if (!session || session.flowType !== this.FLOW_TYPE) return false;
    if (!/^step3_datetime_[123]$/.test(session.currentStep)) return false;

    const tIdx = isoDate ? isoDate.indexOf('T') : -1;
    if (tIdx === -1) {
      LineClient.reply(replyToken, LineClient.text('日時の形式が正しくありません。もう一度選択してください。'));
      return true;
    }
    const date = isoDate.slice(0, tIdx);
    const hhmm = isoDate.slice(tIdx + 1, tIdx + 6);
    return this._acceptDatetime(userId, date, hhmm, replyToken);
  },

  // ===== step 1: 車種 =====

  _handleCar: function(userId, text, replyToken) {
    if (!Security.validateFreeText(text, 100)) {
      LineClient.reply(replyToken, LineClient.text('100文字以内で入力してください'));
      return true;
    }
    const cleaned = Security.stripTags(text).trim();
    const parts = cleaned.split(/\s+/);
    const carMake = parts[0] || '';
    const carModel = parts.slice(1).join(' ') || cleaned;
    SessionManager.update(userId, 'step2_plate', { carMake: carMake, carModel: carModel });
    this._promptPlate(replyToken);
    return true;
  },

  _promptPlate: function(replyToken) {
    LineClient.reply(replyToken, LineClient.text(
      'ナンバープレートの下4桁と、初度登録年（西暦4桁）を教えてください。\n\n' +
      '▼入力形式\n' +
      '　ナンバー4桁（半角スペース）西暦4桁\n\n' +
      '▼例\n' +
      '　1234 2018\n' +
      '　・1234 → ナンバー下4桁\n' +
      '　・2018 → 初度登録年（車検証に記載）'
    ));
  },

  // ===== step 2: ナンバー =====

  _handlePlate: function(userId, text, replyToken) {
    const parts = text.trim().split(/[\s　]+/);
    if (parts.length < 2 || !Security.validateLicensePlate(parts[0]) || !Security.validateYear(parts[1])) {
      LineClient.reply(replyToken, LineClient.text(
        '入力形式をご確認ください。\n\n' +
        '▼正しい形式\n' +
        '　ナンバー4桁（半角スペース）西暦4桁\n\n' +
        '▼例\n' +
        '　1234 2018'
      ));
      return true;
    }
    SessionManager.update(userId, 'step3_datetime_1', {
      licensePlate: parts[0],
      firstRegYear: parseInt(parts[1], 10),
      prefs: []
    });
    this._promptDatetime(replyToken, 1, []);
    return true;
  },

  // ===== step 3: 日時（第1〜第3希望） =====

  /** 日時入力プロンプト（n = 1/2/3, currentPrefs = 現時点の希望配列） */
  _promptDatetime: function(replyToken, n, currentPrefs) {
    const minDate = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd') + 'T09:00';
    const maxD = new Date(); maxD.setDate(maxD.getDate() + 30);
    const maxDate = Utilities.formatDate(maxD, 'Asia/Tokyo', 'yyyy-MM-dd') + 'T17:30';
    const label = n === 1 ? '第1希望の日時' : '第' + n + '希望の日時';

    let prefsSummary = null;
    if (currentPrefs && currentPrefs.length > 0) {
      prefsSummary = currentPrefs
        .map(function(p, i) { return '✅ 第' + (i + 1) + '希望　' + p.date + ' ' + p.time; })
        .join('\n');
    }

    const qr = [
      { type: 'action', action: { type: 'message', label: '明日 10:00',     text: '明日 10:00' } },
      { type: 'action', action: { type: 'message', label: '明日 14:00',     text: '明日 14:00' } },
      { type: 'action', action: { type: 'message', label: '来週月曜 10:00', text: '来週月曜 10:00' } },
      { type: 'action', action: { type: 'message', label: 'キャンセル',     text: 'キャンセル' } }
    ];

    LineClient.reply(replyToken, FlexMessages.datetimePicker({
      title: label + 'を選んでください',
      data: 'flow=shaken&action=datetime',
      minDate: minDate,
      maxDate: maxDate,
      prefsSummary: prefsSummary,
      showSkip: n > 1,
      quickReplies: qr
    }));
  },

  /** テキストで日時を入力された場合（step3_datetime_1/2/3 共通） */
  _handleDatetimeText: function(userId, text, replyToken) {
    const session = SessionManager.get(userId);
    const n = this._stepIndex(session.currentStep);

    // 第2・第3希望ではテキスト「スキップ」を許可
    if (n >= 2 && /^(スキップ|すきっぷ|なし|無し|完了|おわり|終了|これでok|これで確定)$/i.test(text.trim())) {
      return this._advanceAfterPref(userId, replyToken);
    }

    const parsed = DateTimeParser.parse(text);
    if (!parsed) {
      LineClient.reply(replyToken, LineClient.text(
        '日時が読み取れませんでした。下の「📅 日時を選ぶ」から選ぶか、下記のような形式でお送りください。\n\n' +
        '▼例\n' +
        '　2/20 15:00\n' +
        '　2月20日 15時\n' +
        '　明日 10:00\n' +
        '　来週月曜 14時'
      ));
      return true;
    }
    return this._acceptDatetime(userId, parsed.date, parsed.time, replyToken);
  },

  /** 日時が確定した時の共通処理（バリデーション→記録→次プロンプト or 名前へ） */
  _acceptDatetime: function(userId, date, time, replyToken) {
    const session = SessionManager.get(userId);
    const n = this._stepIndex(session.currentStep);
    const prefs = (session.collectedData.prefs || []).slice();

    // スロット間隔に時刻をスナップ（例: 12:30 → 13:00）
    time = SlotRepository.snapTime(time);

    // 営業時間チェック
    const check = DateTimeParser.validateBusinessHours(date, time);
    if (!check.ok) {
      LineClient.reply(replyToken, LineClient.text(
        '申し訳ありません、その日時ではご予約いただけません。\n' +
        '理由：' + check.reason + '\n\n' +
        '▼受付可能な日時\n' +
        '　・今日から30日以内\n' +
        '　・平日・土曜の9:00〜17:30（最終受付）\n' +
        '　・日祝は定休\n\n' +
        'もう一度、日時をお送りください。'
      ));
      return true;
    }

    // 重複チェック
    for (let i = 0; i < prefs.length; i++) {
      if (prefs[i].date === date && prefs[i].time === time) {
        LineClient.reply(replyToken, LineClient.text(
          'その日時はすでに【第' + (i + 1) + '希望】に追加されています。別の日時をお送りください。'
        ));
        return true;
      }
    }

    prefs.push({ date: date, time: time });

    if (n < this.MAX_PREFS) {
      const nextN = n + 1;
      SessionManager.update(userId, 'step3_datetime_' + nextN, { prefs: prefs });
      this._replyAckAndPromptNext(replyToken, n, date, time, prefs);
    } else {
      SessionManager.update(userId, 'step4_name', { prefs: prefs });
      LineClient.reply(replyToken, LineClient.text(
        '✅ 第3希望を承りました：' + date + ' ' + time + '\n\n' +
        this._formatPrefsSummary(prefs) + '\n\n' +
        'ご予約者の' + Security.NAME_PROMPT
      ));
    }
    return true;
  },

  /** 受付完了（確認テキスト）+ 次希望カード（Flex）を 2 件 reply */
  _replyAckAndPromptNext: function(replyToken, justAcceptedN, date, time, prefs) {
    const nextN = justAcceptedN + 1;
    const minDate = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd') + 'T09:00';
    const maxD = new Date(); maxD.setDate(maxD.getDate() + 30);
    const maxDate = Utilities.formatDate(maxD, 'Asia/Tokyo', 'yyyy-MM-dd') + 'T17:30';

    const ackText = LineClient.text(
      '✅ 第' + justAcceptedN + '希望を承りました！\n' + date + ' ' + time
    );

    const prefsSummary = prefs
      .map(function(p, i) { return '✅ 第' + (i + 1) + '希望　' + p.date + ' ' + p.time; })
      .join('\n');

    const qr = [
      { type: 'action', action: { type: 'message', label: '明日 10:00',     text: '明日 10:00' } },
      { type: 'action', action: { type: 'message', label: '明日 14:00',     text: '明日 14:00' } },
      { type: 'action', action: { type: 'message', label: '来週月曜 10:00', text: '来週月曜 10:00' } },
      { type: 'action', action: { type: 'message', label: 'キャンセル',     text: 'キャンセル' } }
    ];

    const nextCard = FlexMessages.datetimePicker({
      title: '第' + nextN + '希望の日時を選んでください',
      data: 'flow=shaken&action=datetime',
      minDate: minDate,
      maxDate: maxDate,
      prefsSummary: prefsSummary,
      showSkip: true,
      quickReplies: qr
    });

    LineClient.reply(replyToken, [ackText, nextCard]);
  },

  /** スキップされた時 → step4_name へ */
  _advanceAfterPref: function(userId, replyToken) {
    const session = SessionManager.get(userId);
    const prefs = session.collectedData.prefs || [];
    if (prefs.length === 0) {
      // 第1希望は必須
      LineClient.reply(replyToken, LineClient.text('第1希望は必須です。日時をお送りください。'));
      return true;
    }
    SessionManager.update(userId, 'step4_name', {});
    LineClient.reply(replyToken, LineClient.text(
      '✅ 希望日時を承りました。\n\n' +
      this._formatPrefsSummary(prefs) + '\n\n' +
      'ご予約者のお名前（フルネーム）を教えてください。'
    ));
    return true;
  },

  _formatPrefsSummary: function(prefs) {
    const lines = ['━━━ ご希望日時 ━━━'];
    for (let i = 0; i < prefs.length; i++) {
      lines.push('　第' + (i + 1) + '希望: ' + prefs[i].date + ' ' + prefs[i].time);
    }
    return lines.join('\n');
  },

  _stepIndex: function(step) {
    const m = /^step3_datetime_(\d)$/.exec(step);
    return m ? parseInt(m[1], 10) : 0;
  },

  // ===== step 4: お名前・電話 =====

  _handleName: function(userId, text, replyToken) {
    const parsed = Security.parseNameAndKana(text);
    if (!parsed.ok) {
      LineClient.reply(replyToken, LineClient.text(Security.NAME_ERROR));
      return true;
    }
    SessionManager.update(userId, 'step4_phone', {
      customerName: parsed.name + '（' + parsed.kana + '）',
      customerNameKanji: parsed.name,
      customerNameKana: parsed.kana
    });
    LineClient.reply(replyToken, LineClient.text('お電話番号を教えてください（例: 090-1234-5678）'));
    return true;
  },

  _handlePhone: function(userId, text, replyToken) {
    if (!Security.validatePhone(text)) {
      LineClient.reply(replyToken, LineClient.text('電話番号は0から始まる10〜11桁でお願いします'));
      return true;
    }
    SessionManager.update(userId, 'step3_datetime_result', { phone: text, serviceTypeLabel: '車検' });
    const data = SessionManager.get(userId).collectedData;
    LineClient.reply(replyToken, FlexMessages.reservationConfirm(data));
    return true;
  },

  // ===== 予約確定 =====

  _confirmReservation: function(userId, replyToken) {
    const session = SessionManager.get(userId);
    if (!session) {
      LineClient.reply(replyToken, LineClient.text('セッションの有効期限が切れました。もう一度「車検予約」からやり直してください。'));
      return true;
    }
    const d = session.collectedData;
    // 後方互換: 旧フロー（prefs なし）にも対応
    const prefs = (d.prefs && d.prefs.length > 0)
      ? d.prefs
      : [{ date: d.reservationDate, time: d.reservationTime }];

    // スロット確保と予約レコード作成を単一トランザクションで実行（ゴースト枠防止）
    const result = this._atomicReserve(userId, d, prefs);

    if (!result.ok) {
      if (result.reason === 'all_full') {
        const lines = ['申し訳ありません、ご希望の日時はすべて埋まってしまいました。', ''];
        for (let i = 0; i < prefs.length; i++) {
          lines.push('❌ 第' + (i + 1) + '希望: ' + prefs[i].date + ' ' + prefs[i].time);
        }
        lines.push('');
        lines.push('もう一度「車検予約」からお試しいただくか、');
        lines.push('お電話（03-1234-5678）でもご相談いただけます。');
        LineClient.reply(replyToken, LineClient.text(lines.join('\n')));
      } else {
        LoggerService.error('reservation create failed', { userId: userId, reason: result.reason });
        LineClient.reply(replyToken, LineClient.text(
          '申し訳ありません、予約処理中にエラーが発生しました。\n' +
          'お手数ですがお電話（03-1234-5678）でご連絡ください。'
        ));
      }
      SessionManager.clear(userId);
      return true;
    }

    const confirmed = prefs[result.confirmedIndex];
    CustomerRepo.upsert(userId, {
      name: d.customerName, nameKana: d.customerNameKana, phone: d.phone,
      carMake: d.carMake, carModel: d.carModel, licensePlate: d.licensePlate
    });
    SessionManager.clear(userId);

    const whichPref = prefs.length > 1 ? '（第' + (result.confirmedIndex + 1) + '希望）' : '';
    LineClient.reply(replyToken, FlexMessages.reservationSuccess(
      result.reservationId, confirmed.date, confirmed.time, d.carMake, d.carModel, whichPref
    ));

    const staff = Config.getOptional('STAFF_LINE_USER_ID', '');
    if (staff) {
      const extra = prefs.length > 1 ? '（第' + (result.confirmedIndex + 1) + '希望 / ' + prefs.length + '候補中）' : '';
      LineClient.push(staff, LineClient.text(
        '🆕 新規予約: ' + confirmed.date + ' ' + confirmed.time + extra + '\n' +
        d.customerName + ' / ' + d.carMake + ' ' + d.carModel + ' / ' + d.phone
      ));
    }
    return true;
  },

  /**
   * スロット確保 → 予約レコード作成 を単一ロック内で完結させる。
   * ReservationRepo.create 失敗時は確保したスロットを解放してロールバック。
   */
  _atomicReserve: function(userId, d, prefs) {
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(15000);
    } catch (e) {
      return { ok: false, reason: 'lock_timeout' };
    }
    let confirmedIndex = -1;
    let reservedDate = null;
    let reservedTime = null;
    try {
      // 希望順にスロット確保試行
      for (let i = 0; i < prefs.length; i++) {
        const p = prefs[i];
        const slotResult = SlotRepository.reserveWithLock(p.date, p.time);
        if (slotResult.ok) {
          confirmedIndex = i;
          reservedDate = p.date;
          reservedTime = p.time;
          break;
        }
      }
      if (confirmedIndex === -1) {
        return { ok: false, reason: 'all_full' };
      }

      // 予約レコード作成
      const payload = Object.assign({}, d, {
        userId: userId,
        reservationDate: reservedDate,
        reservationTime: reservedTime,
        serviceType: '車検'
      });
      try {
        const id = ReservationRepo.create(payload);
        if (!id) throw new Error('create returned empty id');
        return { ok: true, reservationId: id, confirmedIndex: confirmedIndex };
      } catch (createErr) {
        // 予約レコード作成失敗 → 確保済みスロットを解放してロールバック
        try { SlotRepository.releaseWithLock(reservedDate, reservedTime); }
        catch (releaseErr) {
          LoggerService.error('slot release after create-failure failed', {
            date: reservedDate, time: reservedTime, error: releaseErr.message
          });
        }
        return { ok: false, reason: 'create_failed:' + createErr.message };
      }
    } finally {
      lock.releaseLock();
    }
  }
};
