/**
 * LINE Flex Message ファクトリ。
 * すべてのビジュアルカードをここで生成し、呼出側はロジックのみに集中できるようにする。
 *
 * カラーパレット:
 *   shaken   #1565c0  車検 — ディープブルー
 *   repair   #2e7d32  修理 — ディープグリーン
 *   estimate #e65100  見積 — ディープオレンジ
 *   manage   #6a1b9a  予約確認 — ディープパープル
 *   recruit  #00695c  採用 — ティール
 *   success  #2e7d32  完了
 *   danger   #c62828  削除・警告
 *   header   #0f2044  ナビヘッダー
 *   sub      #757575  補足テキスト
 */
const FlexMessages = {

  // ===== デザイントークン =====
  C: {
    shaken:   '#1565c0',
    repair:   '#2e7d32',
    estimate: '#e65100',
    manage:   '#6a1b9a',
    recruit:  '#00695c',
    primary:  '#1e88e5',
    success:  '#2e7d32',
    danger:   '#c62828',
    header:   '#0f2044',
    text:     '#333333',
    sub:      '#757575',
    white:    '#ffffff'
  },

  // ===== サービス種別ラベル（英語キー → 日本語表示） =====
  SERVICE_LABELS: {
    shaken:   '車検',
    repair:   '修理相談',
    estimate: '見積もり',
    board:    '板金',
    other:    'その他'
  },

  // ===== サービスカルーセル（ウェルカム・ヘルプ共用） =====
  serviceCarousel: function() {
    var me = this;
    var services = [
      {
        emoji: '🚗', title: '車検予約',
        desc: '日時を選んで\nかんたん予約',
        color: me.C.shaken,
        action: { type: 'postback', label: '車検予約を始める', data: 'action=start_shaken' }
      },
      {
        emoji: '🔧', title: '修理相談',
        desc: '症状・写真を\n送るだけでOK',
        color: me.C.repair,
        action: { type: 'postback', label: '修理相談を始める', data: 'action=start_repair' }
      },
      {
        emoji: '💰', title: '見積もり',
        desc: '車検・修理・板金\n概算をその場で',
        color: me.C.estimate,
        action: { type: 'postback', label: '見積もりを始める', data: 'action=start_estimate' }
      },
      {
        emoji: '📋', title: '予約確認',
        desc: '変更・キャンセル\nもここから',
        color: me.C.manage,
        action: { type: 'message', label: '予約確認を見る', text: '予約確認' }
      },
      {
        emoji: '🧑‍🔧', title: '採用応募',
        desc: '整備士・受付\nスタッフ募集中',
        color: me.C.recruit,
        action: { type: 'postback', label: '採用応募を始める', data: 'action=start_recruit' }
      }
    ];

    var bubbles = services.map(function(s) {
      return {
        type: 'bubble',
        header: {
          type: 'box', layout: 'vertical',
          paddingTop: 'xl', paddingBottom: 'md', paddingStart: 'md', paddingEnd: 'md',
          backgroundColor: s.color,
          contents: [
            { type: 'text', text: s.emoji, size: 'xxl', align: 'center' },
            { type: 'text', text: s.title, size: 'md', weight: 'bold', color: '#ffffff', align: 'center', margin: 'sm' }
          ]
        },
        body: {
          type: 'box', layout: 'vertical', paddingAll: 'md',
          contents: [
            { type: 'text', text: s.desc, size: 'sm', color: '#555555', wrap: true, align: 'center' }
          ]
        },
        footer: {
          type: 'box', layout: 'vertical', paddingAll: 'sm',
          contents: [
            { type: 'button', style: 'primary', color: s.color, height: 'sm', action: s.action }
          ]
        }
      };
    });

    return {
      type: 'flex',
      altText: 'サンプル自動車整備サービス — 車検予約 修理相談 見積もり 予約確認 採用応募',
      contents: { type: 'carousel', contents: bubbles }
    };
  },

  // ===== 日時選択カード =====
  // opts: { title, data, minDate, maxDate, prefsSummary, showSkip, quickReplies }
  datetimePicker: function(opts) {
    var me = this;
    var bodyContents = [
      { type: 'text', text: opts.title, weight: 'bold', size: 'xl', wrap: true, color: me.C.text },
      {
        type: 'text',
        text: '受付時間　平日・土曜 9:00〜17:30（日祝定休）',
        size: 'xs', color: me.C.sub, wrap: true, margin: 'sm'
      },
      {
        type: 'text',
        text: '📅 下のボタンをタップするとカレンダーが開きます',
        size: 'sm', color: me.C.primary, wrap: true, margin: 'md'
      }
    ];

    if (opts.prefsSummary) {
      bodyContents.push({ type: 'separator', margin: 'lg' });
      bodyContents.push({
        type: 'text', text: '現在の希望日時', size: 'xs', weight: 'bold',
        color: me.C.sub, margin: 'md'
      });
      bodyContents.push({
        type: 'text', text: opts.prefsSummary, size: 'sm', wrap: true, color: me.C.text, margin: 'xs'
      });
    }

    var footerContents = [
      {
        type: 'button',
        style: 'primary',
        color: me.C.primary,
        action: {
          type: 'datetimepicker',
          label: '📅 カレンダーから選ぶ',
          data: opts.data,
          mode: opts.mode || 'datetime',
          min: opts.minDate,
          max: opts.maxDate
        }
      }
    ];

    if (opts.showSkip) {
      footerContents.push({
        type: 'button', style: 'secondary',
        action: { type: 'postback', label: 'ここまでの希望で予約する ⏭', data: 'action=skip_pref' }
      });
    }

    var msg = {
      type: 'flex',
      altText: opts.title + '（カレンダーをタップして日時を選んでください）',
      contents: {
        type: 'bubble',
        body: {
          type: 'box', layout: 'vertical', spacing: 'none',
          paddingTop: 'xl', paddingBottom: 'sm', paddingStart: 'xl', paddingEnd: 'xl',
          contents: bodyContents
        },
        footer: {
          type: 'box', layout: 'vertical', spacing: 'sm',
          paddingAll: 'md',
          contents: footerContents
        }
      }
    };

    if (opts.quickReplies && opts.quickReplies.length > 0) {
      msg.quickReply = { items: opts.quickReplies };
    }

    return msg;
  },

  // ===== 予約内容確認カード =====
  reservationConfirm: function(data) {
    var me = this;
    var prefs = (data.prefs && data.prefs.length > 0)
      ? data.prefs
      : (data.reservationDate ? [{ date: data.reservationDate, time: data.reservationTime }] : []);

    var dateRows = [];
    if (prefs.length > 1) {
      for (var i = 0; i < prefs.length; i++) {
        dateRows.push(me._kv('第' + (i + 1) + '希望', prefs[i].date + ' ' + prefs[i].time));
      }
    } else if (prefs.length === 1) {
      dateRows.push(me._kv('日時', prefs[0].date + ' ' + prefs[0].time));
    }

    var bodyContents = [me._kv('サービス', data.serviceTypeLabel || '車検')]
      .concat(dateRows)
      .concat([
        me._kv('お車', (data.carMake || '') + ' ' + (data.carModel || '')),
        me._kv('ナンバー', data.licensePlate),
        me._kv('お名前', data.customerName),
        me._kv('お電話', data.phone)
      ]);

    if (prefs.length > 1) {
      bodyContents.push({ type: 'separator', margin: 'md' });
      bodyContents.push({
        type: 'text',
        text: '※ 第1希望から順に空きを確認し、最初に取れた日時で確定します。',
        size: 'xs', color: me.C.sub, wrap: true, margin: 'md'
      });
    }

    return {
      type: 'flex',
      altText: '予約内容をご確認ください',
      contents: {
        type: 'bubble',
        header: {
          type: 'box', layout: 'vertical', paddingAll: 'md',
          backgroundColor: me.C.header,
          contents: [
            { type: 'text', text: '予約内容のご確認', weight: 'bold', color: me.C.white, size: 'lg' },
            { type: 'text', text: '内容をご確認のうえ「予約する」をタップしてください', color: '#aaaaaa', size: 'xs', margin: 'xs' }
          ]
        },
        body: {
          type: 'box', layout: 'vertical', spacing: 'md',
          paddingTop: 'xl', paddingBottom: 'sm', paddingStart: 'xl', paddingEnd: 'xl',
          contents: bodyContents
        },
        footer: {
          type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: 'md',
          contents: [
            {
              type: 'button', style: 'primary', color: me.C.success,
              action: { type: 'postback', label: '✅ この内容で予約する', data: 'action=confirm_reservation' }
            },
            {
              type: 'button', style: 'secondary',
              action: { type: 'postback', label: '✏️ 内容を修正する', data: 'action=edit_reservation' }
            }
          ]
        }
      }
    };
  },

  // ===== 予約完了カード =====
  reservationSuccess: function(id, date, time, carMake, carModel, whichPref) {
    var me = this;
    var dateDisplay = date + '　' + time + (whichPref ? '　' + whichPref : '');
    return {
      type: 'flex',
      altText: '✅ ご予約が完了しました！',
      contents: {
        type: 'bubble',
        header: {
          type: 'box', layout: 'vertical', paddingAll: 'lg',
          backgroundColor: me.C.success,
          contents: [
            { type: 'text', text: '✅', size: 'xxl', align: 'center' },
            { type: 'text', text: 'ご予約が完了しました！', weight: 'bold', color: me.C.white, size: 'lg', align: 'center', margin: 'sm' }
          ]
        },
        body: {
          type: 'box', layout: 'vertical', spacing: 'md',
          paddingTop: 'xl', paddingBottom: 'sm', paddingStart: 'xl', paddingEnd: 'xl',
          contents: [
            me._kv('予約番号', id),
            me._kv('確定日時', dateDisplay),
            me._kv('お車', (carMake || '') + ' ' + (carModel || '')),
            { type: 'separator', margin: 'md' },
            {
              type: 'text',
              text: '前日の夕方にリマインド通知をお送りします。\nご変更・キャンセルは「予約確認」からどうぞ。',
              size: 'sm', color: me.C.sub, wrap: true, margin: 'md'
            }
          ]
        },
        footer: {
          type: 'box', layout: 'vertical', paddingAll: 'md',
          contents: [
            {
              type: 'button', style: 'secondary',
              action: { type: 'message', label: '📋 予約を確認する', text: '予約確認' }
            }
          ]
        }
      }
    };
  },

  // ===== キャンセル確認カード =====
  cancelConfirm: function(reservationId, dateStr, timeStr, carLabel) {
    var me = this;
    return {
      type: 'flex',
      altText: 'キャンセルの確認',
      contents: {
        type: 'bubble',
        header: {
          type: 'box', layout: 'vertical', paddingAll: 'md',
          backgroundColor: me.C.danger,
          contents: [
            { type: 'text', text: '⚠️ キャンセルの確認', weight: 'bold', color: me.C.white, size: 'lg' }
          ]
        },
        body: {
          type: 'box', layout: 'vertical', spacing: 'md',
          paddingTop: 'xl', paddingBottom: 'sm', paddingStart: 'xl', paddingEnd: 'xl',
          contents: [
            me._kv('日時', dateStr + '　' + timeStr),
            me._kv('お車', carLabel || '-'),
            { type: 'separator', margin: 'md' },
            {
              type: 'text',
              text: 'この予約をキャンセルしてよろしいですか？\nキャンセル後は元に戻せません。',
              size: 'sm', color: me.C.sub, wrap: true, margin: 'md'
            }
          ]
        },
        footer: {
          type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: 'md',
          contents: [
            {
              type: 'button', style: 'primary', color: me.C.danger,
              action: { type: 'postback', label: 'キャンセルする', data: 'action=cancel_confirmed&id=' + reservationId }
            },
            {
              type: 'button', style: 'secondary',
              action: { type: 'message', label: '← 戻る（キャンセルしない）', text: '予約確認' }
            }
          ]
        }
      }
    };
  },

  // ===== キャンセル完了カード =====
  cancelSuccess: function(date, time) {
    var me = this;
    return {
      type: 'flex',
      altText: 'ご予約をキャンセルしました',
      contents: {
        type: 'bubble',
        header: {
          type: 'box', layout: 'vertical', paddingAll: 'md',
          backgroundColor: me.C.sub,
          contents: [
            { type: 'text', text: 'ご予約をキャンセルしました', weight: 'bold', color: me.C.white, size: 'md' }
          ]
        },
        body: {
          type: 'box', layout: 'vertical', paddingAll: 'xl',
          contents: [
            me._kv('キャンセル日時', date + '　' + time),
            { type: 'separator', margin: 'md' },
            {
              type: 'text', text: '再予約はいつでも「車検予約」からどうぞ。',
              size: 'sm', color: me.C.sub, wrap: true, margin: 'md'
            }
          ]
        },
        footer: {
          type: 'box', layout: 'vertical', paddingAll: 'md',
          contents: [
            {
              type: 'button', style: 'primary', color: me.C.shaken,
              action: { type: 'postback', label: '🚗 再予約する', data: 'action=start_shaken' }
            }
          ]
        }
      }
    };
  },

  // ===== 予約変更完了カード =====
  editSuccess: function(oldDate, oldTime, newDate, newTime) {
    var me = this;
    return {
      type: 'flex',
      altText: '✅ 予約を変更しました',
      contents: {
        type: 'bubble',
        header: {
          type: 'box', layout: 'vertical', paddingAll: 'md',
          backgroundColor: me.C.success,
          contents: [
            { type: 'text', text: '✅ 予約を変更しました', weight: 'bold', color: me.C.white, size: 'lg' }
          ]
        },
        body: {
          type: 'box', layout: 'vertical', spacing: 'md',
          paddingTop: 'xl', paddingBottom: 'sm', paddingStart: 'xl', paddingEnd: 'xl',
          contents: [
            me._kv('変更前', oldDate + '　' + oldTime),
            me._kv('変更後', newDate + '　' + newTime),
            { type: 'separator', margin: 'md' },
            {
              type: 'text', text: '変更後の予約は「予約確認」から確認できます。',
              size: 'sm', color: me.C.sub, wrap: true, margin: 'md'
            }
          ]
        },
        footer: {
          type: 'box', layout: 'vertical', paddingAll: 'md',
          contents: [
            { type: 'button', style: 'secondary', action: { type: 'message', label: '📋 予約を確認する', text: '予約確認' } }
          ]
        }
      }
    };
  },

  // ===== 予約一覧カード =====
  reservationList: function(reservations) {
    var me = this;
    var items = [];
    var list = reservations.slice(0, 10);
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (i > 0) items.push({ type: 'separator', margin: 'md' });
      items.push({
        type: 'box', layout: 'vertical', margin: i > 0 ? 'md' : 'none',
        contents: [
          {
            type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
              { type: 'text', text: r.reservationDate, weight: 'bold', flex: 3, size: 'sm', color: me.C.text },
              { type: 'text', text: r.reservationTime, flex: 2, size: 'sm', color: me.C.primary, align: 'end' }
            ]
          },
          {
            type: 'text',
            text: (me.SERVICE_LABELS[r.serviceType] || r.serviceType || '') + '　' + (r.carMake || '') + ' ' + (r.carModel || ''),
            size: 'xs', color: me.C.sub, margin: 'xs'
          },
          {
            type: 'box', layout: 'horizontal', margin: 'sm', spacing: 'sm',
            contents: [
              {
                type: 'button', style: 'primary', height: 'sm', color: me.C.primary,
                action: { type: 'postback', label: '変更', data: 'action=modify&id=' + r.reservationId }
              },
              {
                type: 'button', style: 'secondary', height: 'sm',
                action: { type: 'postback', label: 'キャンセル', data: 'action=cancel&id=' + r.reservationId }
              }
            ]
          }
        ]
      });
    }

    return {
      type: 'flex',
      altText: 'ご予約一覧',
      contents: {
        type: 'bubble',
        header: {
          type: 'box', layout: 'vertical', paddingAll: 'md',
          backgroundColor: me.C.manage,
          contents: [
            { type: 'text', text: '📋 ご予約一覧', weight: 'bold', color: me.C.white, size: 'lg' },
            { type: 'text', text: '変更・キャンセルはボタンをタップ', color: '#cccccc', size: 'xs', margin: 'xs' }
          ]
        },
        body: { type: 'box', layout: 'vertical', paddingAll: 'md', contents: items }
      }
    };
  },

  // ===== 修理・見積もり受付完了カード =====
  inquirySuccess: function(typeLabel, staffPhone) {
    var me = this;
    return {
      type: 'flex',
      altText: typeLabel + 'を受け付けました',
      contents: {
        type: 'bubble',
        header: {
          type: 'box', layout: 'vertical', paddingAll: 'md',
          backgroundColor: typeLabel === '修理相談' ? me.C.repair : me.C.estimate,
          contents: [
            { type: 'text', text: '✅ ' + typeLabel + 'を受け付けました', weight: 'bold', color: me.C.white, size: 'md', wrap: true }
          ]
        },
        body: {
          type: 'box', layout: 'vertical', paddingAll: 'xl',
          contents: [
            {
              type: 'text',
              text: ShopHours.replyEtaMessage(),
              size: 'sm', wrap: true, color: me.C.text
            },
            { type: 'separator', margin: 'lg' },
            {
              type: 'text', text: 'お急ぎの方はお電話でもご相談いただけます（9:00〜18:00／日祝休）。',
              size: 'xs', color: me.C.sub, wrap: true, margin: 'md'
            }
          ]
        },
        footer: {
          type: 'box', layout: 'vertical', paddingAll: 'md',
          contents: [
            {
              type: 'button', style: 'primary', color: me.C.primary,
              action: { type: 'uri', label: '📞 今すぐ電話する', uri: 'tel:' + (staffPhone || '0312345678') }
            }
          ]
        }
      }
    };
  },

  // ===== 電話カード =====
  phoneCard: function() {
    var me = this;
    return {
      type: 'flex',
      altText: 'サンプル自動車整備サービス 電話番号',
      contents: {
        type: 'bubble',
        body: {
          type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: 'xl',
          contents: [
            { type: 'text', text: 'お電話でのお問い合わせ', weight: 'bold', size: 'md', color: me.C.text },
            { type: 'text', text: '03-1234-5678', size: 'xxl', weight: 'bold', color: me.C.danger, margin: 'md' },
            { type: 'text', text: '受付時間　9:00〜18:00（日祝定休）', size: 'sm', color: me.C.sub }
          ]
        },
        footer: {
          type: 'box', layout: 'vertical', paddingAll: 'md',
          contents: [
            {
              type: 'button', style: 'primary', color: me.C.danger,
              action: { type: 'uri', label: '📞 今すぐ電話する', uri: 'tel:0312345678' }
            }
          ]
        }
      }
    };
  },

  // ===== 営業情報カード =====
  infoCard: function() {
    var me = this;
    return {
      type: 'flex',
      altText: 'サンプル自動車整備サービス 営業情報',
      contents: {
        type: 'bubble',
        header: {
          type: 'box', layout: 'vertical', paddingAll: 'md',
          backgroundColor: me.C.header,
          contents: [
            { type: 'text', text: '📍 サンプル自動車整備サービス', weight: 'bold', color: me.C.white, size: 'lg', wrap: true }
          ]
        },
        body: {
          type: 'box', layout: 'vertical', spacing: 'md', paddingAll: 'xl',
          contents: [
            me._kv('住所', '[サンプル住所]'),
            me._kv('電話', '03-1234-5678'),
            me._kv('営業時間', '9:00〜18:00'),
            me._kv('定休日', '日曜・祝日')
          ]
        },
        footer: {
          type: 'box', layout: 'vertical', paddingAll: 'md',
          contents: [
            {
              type: 'button', style: 'primary', color: me.C.primary,
              action: { type: 'uri', label: '🗺️ 地図を開く', uri: 'https://maps.google.com/?q=' + encodeURIComponent('[サンプル住所]') }
            }
          ]
        }
      }
    };
  },

  // ===== ユーティリティ =====
  _kv: function(label, value) {
    return {
      type: 'box', layout: 'baseline', spacing: 'sm',
      contents: [
        { type: 'text', text: label, size: 'sm', color: this.C.sub, flex: 2 },
        { type: 'text', text: String(value || '-'), size: 'sm', flex: 5, wrap: true, color: this.C.text }
      ]
    };
  }
};
