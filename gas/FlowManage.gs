const FlowManage = {
  list: function(userId, replyToken) {
    const reservations = ReservationRepo.findByUserId(userId);
    if (reservations.length === 0) {
      LineClient.reply(replyToken, LineClient.text('現在ご予約はございません。'));
      return;
    }
    LineClient.reply(replyToken, FlexMessages.reservationList(reservations));
  },

  handlePostback: function(userId, params, replyToken) {
    // --- キャンセル: 確認ステップ1 ---
    if (params.action === 'cancel' && params.id) {
      const userReservations = ReservationRepo.findByUserId(userId);
      const owned = userReservations.some(function(r) { return r.reservationId === params.id; });
      if (!owned) {
        LineClient.reply(replyToken, LineClient.text('予約が見つかりませんでした'));
        return true;
      }
      const target = userReservations.find(function(r) { return r.reservationId === params.id; });

      // 24時間以内はLINEからキャンセル不可
      try {
        const resD = target.reservationDate instanceof Date ? target.reservationDate : new Date(String(target.reservationDate));
        const dateStr = Utilities.formatDate(resD, 'Asia/Tokyo', 'yyyy-MM-dd');
        const timeStr = String(target.reservationTime || '09:00').slice(0, 5);
        const resDateTime = new Date(dateStr + 'T' + timeStr + ':00+09:00');
        if ((resDateTime.getTime() - Date.now()) < 24 * 60 * 60 * 1000) {
          LineClient.reply(replyToken, LineClient.text(
            '申し訳ありません。\n' +
            'ご予約の24時間前を過ぎているため、LINEからのキャンセルができません。\n\n' +
            'お手数ですが、お電話にてご連絡ください。\n' +
            '📞 03-1234-5678（9:00〜18:00／日祝休）'
          ));
          return true;
        }
      } catch (e) { /* 日時解析失敗時は制限なしで続行 */ }

      const carLabel = ((target.carMake || '') + ' ' + (target.carModel || '')).trim() || FlexMessages.SERVICE_LABELS[target.serviceType] || target.serviceType || '-';
      LineClient.reply(replyToken, FlexMessages.cancelConfirm(
        params.id, target.reservationDate, target.reservationTime, carLabel
      ));
      return true;
    }

    // --- キャンセル: 確定 ---
    if (params.action === 'cancel_confirmed' && params.id) {
      const userReservations = ReservationRepo.findByUserId(userId);
      const owned = userReservations.some(function(r) { return r.reservationId === params.id; });
      if (!owned) {
        LineClient.reply(replyToken, LineClient.text('予約が見つかりませんでした'));
        return true;
      }
      const result = this._cancelAtomic(params.id);
      if (result.ok) {
        LineClient.reply(replyToken, FlexMessages.cancelSuccess(result.date, result.time));
        const staff = Config.getOptional('STAFF_LINE_USER_ID', '');
        if (staff) LineClient.push(staff, LineClient.text('[キャンセル] ' + params.id + ' / ' + result.date + ' ' + result.time));
      } else {
        LineClient.reply(replyToken, LineClient.text('予約が見つかりませんでした'));
      }
      return true;
    }

    // --- 変更: 新日時選択 ---
    if (params.action === 'modify' && params.id) {
      const userReservations = ReservationRepo.findByUserId(userId);
      const owned = userReservations.some(function(r) { return r.reservationId === params.id; });
      if (!owned) {
        LineClient.reply(replyToken, LineClient.text('予約が見つかりませんでした'));
        return true;
      }
      const target = userReservations.find(function(r) { return r.reservationId === params.id; });
      SessionManager.start(userId, 'manage_edit');
      SessionManager.update(userId, 'edit_datetime', {
        originalId: params.id,
        originalDate: target.reservationDate,
        originalTime: target.reservationTime,
        serviceType: target.serviceType
      });
      const minDate = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd') + 'T09:00';
      const maxD = new Date(); maxD.setDate(maxD.getDate() + 30);
      const maxDate = Utilities.formatDate(maxD, 'Asia/Tokyo', 'yyyy-MM-dd') + 'T17:30';
      LineClient.reply(replyToken, FlexMessages.datetimePicker({
        title: '新しい日時を選んでください',
        data: 'flow=manage_edit&action=datetime',
        minDate: minDate,
        maxDate: maxDate,
        prefsSummary: '現在の予約　' + target.reservationDate + ' ' + target.reservationTime,
        showSkip: false,
        quickReplies: [{ type: 'action', action: { type: 'message', label: 'キャンセル', text: 'キャンセル' } }]
      }));
      return true;
    }

    return false;
  },

  /** 変更フロー: テキスト日時入力 */
  handleEditMessage: function(userId, text, replyToken) {
    const session = SessionManager.get(userId);
    if (!session || session.flowType !== 'manage_edit') return false;
    if (text === 'キャンセル' || text === 'メニューに戻る') {
      SessionManager.clear(userId);
      LineClient.reply(replyToken, LineClient.text('変更をキャンセルしました。'));
      return true;
    }
    if (session.currentStep === 'edit_datetime') {
      const parsed = DateTimeParser.parse(text);
      if (!parsed) {
        LineClient.reply(replyToken, LineClient.text('日時が読み取れませんでした。\n例）2/25 10:00　明日 14:00'));
        return true;
      }
      return this._attemptEdit(userId, parsed.date, parsed.time, replyToken);
    }
    return false;
  },

  /** 変更フロー: DateTimePicker からの入力 */
  handleEditDatetimePicker: function(userId, isoDate, replyToken) {
    const session = SessionManager.get(userId);
    if (!session || session.flowType !== 'manage_edit') return false;
    const tIdx = isoDate ? isoDate.indexOf('T') : -1;
    if (tIdx === -1) {
      LineClient.reply(replyToken, LineClient.text('日時の形式が正しくありません。もう一度選択してください。'));
      return true;
    }
    return this._attemptEdit(userId, isoDate.slice(0, tIdx), isoDate.slice(tIdx + 1, tIdx + 6), replyToken);
  },

  /** 新枠を先に確保 → 成功したら旧枠解放（swap方式） */
  _attemptEdit: function(userId, newDate, newTime, replyToken) {
    const session = SessionManager.get(userId);
    const d = session.collectedData;

    const check = DateTimeParser.validateBusinessHours(newDate, newTime);
    if (!check.ok) {
      LineClient.reply(replyToken, LineClient.text(
        '申し訳ありません、その日時ではご予約いただけません。\n理由：' + check.reason + '\n\nもう一度日時を選んでください。'
      ));
      return true;
    }
    // スロット間隔に時刻をスナップ（例: 12:30 → 13:00）
    newTime = SlotRepository.snapTime(newTime);

    if (newDate === String(d.originalDate) && newTime === String(d.originalTime)) {
      LineClient.reply(replyToken, LineClient.text('現在と同じ日時です。別の日時をお選びください。'));
      return true;
    }

    // 新枠を先に確保
    const reserveResult = SlotRepository.reserveWithLock(newDate, newTime);
    if (!reserveResult.ok) {
      const errMsg = reserveResult.reason === 'full'
        ? '申し訳ありません、' + newDate + ' ' + newTime + ' は満席です。\n別の日時をお選びください。'
        : '申し訳ありません、' + newDate + ' ' + newTime + ' は受付枠がありません。\n9:00〜17:00の時間帯でお選びください。';
      LineClient.reply(replyToken, LineClient.text(errMsg));
      return true;
    }

    // 新枠確保成功 → 予約レコード更新 → 旧枠解放
    const updateOk = ReservationRepo.updateDateTime(d.originalId, newDate, newTime);
    if (updateOk) {
      SlotRepository.releaseWithLock(d.originalDate, d.originalTime);
      SessionManager.clear(userId);
      LineClient.reply(replyToken, FlexMessages.editSuccess(d.originalDate, d.originalTime, newDate, newTime));
      const staff = Config.getOptional('STAFF_LINE_USER_ID', '');
      if (staff) LineClient.push(staff, LineClient.text(
        '[予約変更] ' + d.originalId + '\n' +
        d.originalDate + ' ' + d.originalTime + ' → ' + newDate + ' ' + newTime
      ));
    } else {
      // レコード更新失敗: 新枠を戻す
      SlotRepository.releaseWithLock(newDate, newTime);
      SessionManager.clear(userId);
      LineClient.reply(replyToken, LineClient.text(
        '予約の変更中にエラーが発生しました。\nお手数ですがお電話（03-1234-5678）でご連絡ください。'
      ));
    }
    return true;
  },

  /** キャンセル（ReservationRepo更新 + SlotRepository解放）をロック内で原子的に実行 */
  _cancelAtomic: function(reservationId) {
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);
      const result = ReservationRepo.cancel(reservationId);
      if (!result) return { ok: false };
      SlotRepository.releaseWithLock(result.date, result.time);
      return { ok: true, date: result.date, time: result.time };
    } finally {
      lock.releaseLock();
    }
  }
};
