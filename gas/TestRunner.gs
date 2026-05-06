const Test = {
  _results: [],
  assertEquals: function(name, expected, actual) {
    const ok = JSON.stringify(expected) === JSON.stringify(actual);
    this._results.push({ name: name, ok: ok, expected: expected, actual: actual });
    if (!ok) throw new Error('FAIL ' + name + ': expected ' + JSON.stringify(expected) + ' got ' + JSON.stringify(actual));
  },
  assertTrue: function(name, value) {
    this.assertEquals(name, true, !!value);
  },
  assertThrows: function(name, fn) {
    let threw = false;
    try { fn(); }
    catch (e) { threw = true; }
    if (threw) {
      this._results.push({ name: name, ok: true });
    } else {
      this._results.push({ name: name, ok: false, error: 'expected throw but none occurred' });
      throw new Error('FAIL ' + name + ': expected throw');
    }
  },
  run: function(tests) {
    this._results = [];
    for (const [name, fn] of Object.entries(tests)) {
      try { fn(); console.log('✅ ' + name); }
      catch (e) { console.error('❌ ' + name + ': ' + e.message); }
    }
    return this._results;
  }
};

function test_Config() {
  Test.run({
    'Config.get throws for missing key': () => {
      Test.assertThrows('missing', () => Config.get('NON_EXISTENT_KEY_XYZ'));
    }
  });
}

function test_Config_optional() {
  Test.run({
    'Config.getOptional returns default for missing key': () => {
      Test.assertEquals('optional default', 'default_val', Config.getOptional('NON_EXISTENT_KEY_XYZ', 'default_val'));
    }
  });
}

function test_Logger() {
  Test.run({
    'Logger.maskPhone masks middle digits': () => {
      Test.assertEquals('phone', '080-****-1234', LoggerService.maskPhone('080-5678-1234'));
    },
    'Logger.maskName keeps first char': () => {
      Test.assertEquals('name', '山***', LoggerService.maskName('山田太郎'));
    },
    'Logger.maskPII masks all fields': () => {
      const masked = LoggerService.maskPII({ name: '佐藤花子', phone: '09012345678', carModel: 'プリウス' });
      Test.assertEquals('name masked', '佐***', masked.name);
      Test.assertEquals('phone masked', '090-****-5678', masked.phone);
      Test.assertEquals('car preserved', 'プリウス', masked.carModel);
    }
  });
}

function test_Logger_edge_cases() {
  Test.run({
    'maskPhone returns *** for short number': () => {
      Test.assertEquals('short phone', '***', LoggerService.maskPhone('123'));
    },
    'maskPhone handles null': () => {
      Test.assertEquals('null phone', null, LoggerService.maskPhone(null));
    },
    'maskName returns * for single char': () => {
      Test.assertEquals('single char', '*', LoggerService.maskName('山'));
    },
    'maskName handles empty string': () => {
      Test.assertEquals('empty name', '', LoggerService.maskName(''));
    },
    'maskPII masks customerName': () => {
      const masked = LoggerService.maskPII({ customerName: '山田太郎' });
      Test.assertEquals('customerName', '田***', masked.customerName);
    },
    'maskPII does not mutate input': () => {
      const original = { name: '山田太郎', phone: '09012345678' };
      const originalName = original.name;
      LoggerService.maskPII(original);
      Test.assertEquals('no mutation', originalName, original.name);
    }
  });
}

function test_Security_signature() {
  const secret = 'test-secret-key';
  const body = '{"events":[]}';
  const hash = Utilities.computeHmacSha256Signature(body, secret);
  const validSig = Utilities.base64Encode(hash);

  Test.run({
    'verifySignature accepts valid signature': () => {
      Test.assertTrue('valid', Security.verifySignature(body, validSig, secret));
    },
    'verifySignature rejects invalid signature': () => {
      Test.assertTrue('invalid', !Security.verifySignature(body, 'wrong-sig', secret));
    },
    'verifySignature rejects empty signature': () => {
      Test.assertTrue('empty', !Security.verifySignature(body, '', secret));
    },
    'verifySignature rejects tampered body': () => {
      Test.assertTrue('tampered', !Security.verifySignature(body + 'x', validSig, secret));
    }
  });
}

function test_Security_validation() {
  Test.run({
    'validatePhone accepts 10-digit': () => {
      Test.assertTrue('10digit', Security.validatePhone('0312345678'));
    },
    'validatePhone accepts hyphenated': () => {
      Test.assertTrue('hyphen', Security.validatePhone('03-1234-5678'));
    },
    'validatePhone rejects letters': () => {
      Test.assertTrue('letters', !Security.validatePhone('abc-def-ghij'));
    },
    'validatePhone rejects short': () => {
      Test.assertTrue('short', !Security.validatePhone('123'));
    },
    'validateName accepts normal name': () => {
      Test.assertTrue('ok', Security.validateName('山田太郎'));
    },
    'validateName rejects over-50': () => {
      Test.assertTrue('toolong', !Security.validateName('あ'.repeat(51)));
    },
    'validateName rejects empty': () => {
      Test.assertTrue('empty', !Security.validateName(''));
    },
    'validateLicensePlate accepts 4-digit': () => {
      Test.assertTrue('ok', Security.validateLicensePlate('1234'));
    },
    'stripTags removes script tag': () => {
      Test.assertEquals('clean', 'hello', Security.stripTags('<script>alert(1)</script>hello'));
    },
    'validateYear accepts current year': () => {
      Test.assertTrue('current', Security.validateYear(new Date().getFullYear()));
    },
    'validateYear accepts 1980': () => {
      Test.assertTrue('min', Security.validateYear(1980));
    },
    'validateYear rejects 1979': () => {
      Test.assertTrue('below', !Security.validateYear(1979));
    },
    'validateYear rejects future year': () => {
      Test.assertTrue('future', !Security.validateYear(new Date().getFullYear() + 1));
    },
    'validateFreeText accepts within limit': () => {
      Test.assertTrue('ok', Security.validateFreeText('hello'));
    },
    'validateFreeText rejects over limit': () => {
      Test.assertTrue('over', !Security.validateFreeText('a'.repeat(501)));
    },
    'validateFreeText rejects empty string': () => {
      Test.assertTrue('empty', !Security.validateFreeText(''));
    },
    'validateFreeText respects custom maxLen': () => {
      Test.assertTrue('custom', !Security.validateFreeText('12345678901', 10));
    }
  });
}

function test_Security_formulaInjection() {
  Test.run({
    'sanitizeForSheet prefixes equals sign': () => {
      Test.assertEquals('eq', "'=HYPERLINK(\"x\")", Security.sanitizeForSheet('=HYPERLINK("x")'));
    },
    'sanitizeForSheet prefixes plus': () => {
      Test.assertEquals('plus', "'+1+1", Security.sanitizeForSheet('+1+1'));
    },
    'sanitizeForSheet prefixes minus': () => {
      Test.assertEquals('minus', "'-1", Security.sanitizeForSheet('-1'));
    },
    'sanitizeForSheet prefixes at-sign': () => {
      Test.assertEquals('at', "'@SUM(1)", Security.sanitizeForSheet('@SUM(1)'));
    },
    'sanitizeForSheet passes through safe text': () => {
      Test.assertEquals('safe', '山田太郎', Security.sanitizeForSheet('山田太郎'));
    },
    'sanitizeForSheet passes through numbers': () => {
      Test.assertEquals('num', 123, Security.sanitizeForSheet(123));
    }
  });
}

function test_Security_rateLimit() {
  const testUserId = 'TEST_USER_' + new Date().getTime();
  Test.run({
    'rateLimit allows first 10 requests': () => {
      for (let i = 0; i < 10; i++) {
        Test.assertTrue('req' + i, Security.rateLimit(testUserId));
      }
    },
    'rateLimit blocks 11th request': () => {
      Test.assertTrue('blocked', !Security.rateLimit(testUserId));
    }
  });
}

function test_SessionManager() {
  const userId = 'TEST_' + new Date().getTime();
  Test.run({
    'start creates session': () => {
      SessionManager.start(userId, 'shaken');
      const s = SessionManager.get(userId);
      Test.assertEquals('flowType', 'shaken', s.flowType);
      Test.assertEquals('step', 'step1', s.currentStep);
    },
    'update advances step': () => {
      SessionManager.update(userId, 'step2', { carModel: 'プリウス' });
      const s = SessionManager.get(userId);
      Test.assertEquals('step', 'step2', s.currentStep);
      Test.assertEquals('data', 'プリウス', s.collectedData.carModel);
    },
    'clear removes session': () => {
      SessionManager.clear(userId);
      Test.assertEquals('null', null, SessionManager.get(userId));
    }
  });
}

function test_FlowShaken() {
  Test.run({
    'parseQuery parses action=start_shaken': () => {
      const result = parseQuery('action=start_shaken');
      Test.assertEquals('action', 'start_shaken', result.action);
    },
    'parseQuery parses multi-param string': () => {
      const result = parseQuery('action=flow&step=confirm_car&v=yes');
      Test.assertEquals('action', 'flow', result.action);
      Test.assertEquals('step', 'confirm_car', result.step);
      Test.assertEquals('v', 'yes', result.v);
    },
    'parseQuery handles empty string': () => {
      const result = parseQuery('');
      Test.assertEquals('empty', {}, result);
    },
    'parseQuery handles URL-encoded chars': () => {
      const result = parseQuery('action=flow%26step=test');
      Test.assertEquals('decoded', 'flow&step=test', result.action);
    },
    'car split: トヨタ プリウス gives make=トヨタ model=プリウス': () => {
      const text = 'トヨタ プリウス';
      const parts = text.split(/\s+/);
      const carMake = parts[0] || '';
      const carModel = parts.slice(1).join(' ') || text;
      Test.assertEquals('make', 'トヨタ', carMake);
      Test.assertEquals('model', 'プリウス', carModel);
    },
    'car with no space: single word fallback': () => {
      const text = 'プリウス';
      const parts = text.split(/\s+/);
      const carMake = parts[0] || '';
      const carModel = parts.slice(1).join(' ') || text;
      Test.assertEquals('make', 'プリウス', carMake);
      Test.assertEquals('model fallback', 'プリウス', carModel);
    }
  });
}

function test_parseNameAndKana() {
  Test.run({
    'bracket form: 山田太郎（ヤマダタロウ）': () => {
      const r = Security.parseNameAndKana('山田太郎（ヤマダタロウ）');
      Test.assertTrue('ok', r.ok);
      Test.assertEquals('name', '山田太郎', r.name);
      Test.assertEquals('kana', 'ヤマダタロウ', r.kana);
    },
    'ascii bracket: 山田太郎(ヤマダタロウ)': () => {
      const r = Security.parseNameAndKana('山田太郎(ヤマダタロウ)');
      Test.assertTrue('ok', r.ok);
      Test.assertEquals('kana', 'ヤマダタロウ', r.kana);
    },
    'slash form: 山田 太郎／ヤマダ タロウ': () => {
      const r = Security.parseNameAndKana('山田 太郎／ヤマダ タロウ');
      Test.assertTrue('ok', r.ok);
      Test.assertEquals('name', '山田 太郎', r.name);
      Test.assertEquals('kana', 'ヤマダ タロウ', r.kana);
    },
    'newline form': () => {
      const r = Security.parseNameAndKana('山田太郎\nヤマダタロウ');
      Test.assertTrue('ok', r.ok);
      Test.assertEquals('kana', 'ヤマダタロウ', r.kana);
    },
    'hiragana kana normalized to katakana': () => {
      const r = Security.parseNameAndKana('山田太郎（やまだたろう）');
      Test.assertTrue('ok', r.ok);
      Test.assertEquals('kana', 'ヤマダタロウ', r.kana);
    },
    'concatenated form: 山田太郎ヤマダタロウ': () => {
      const r = Security.parseNameAndKana('山田太郎ヤマダタロウ');
      Test.assertTrue('ok', r.ok);
      Test.assertEquals('name', '山田太郎', r.name);
      Test.assertEquals('kana', 'ヤマダタロウ', r.kana);
    },
    'concatenated with hiragana: 山田太郎やまだたろう': () => {
      const r = Security.parseNameAndKana('山田太郎やまだたろう');
      Test.assertTrue('ok', r.ok);
      Test.assertEquals('name', '山田太郎', r.name);
      Test.assertEquals('kana', 'ヤマダタロウ', r.kana);
    },
    'concatenated with space: 山田 太郎 ヤマダ タロウ': () => {
      const r = Security.parseNameAndKana('山田 太郎 ヤマダ タロウ');
      Test.assertTrue('ok', r.ok);
      Test.assertEquals('name trimmed', '山田 太郎', r.name.trim());
      Test.assertEquals('kana trimmed', 'ヤマダ タロウ', r.kana.trim());
    },
    'rejects name only': () => {
      const r = Security.parseNameAndKana('山田太郎');
      Test.assertEquals('rejected', false, r.ok);
    },
    'rejects kana only': () => {
      const r = Security.parseNameAndKana('ヤマダタロウ');
      Test.assertEquals('rejected', false, r.ok);
    },
    'rejects empty': () => {
      const r = Security.parseNameAndKana('');
      Test.assertEquals('rejected', false, r.ok);
    }
  });
}

function test_classifyIntent() {
  Test.run({
    '車検 → shaken': () => {
      Test.assertEquals('shaken', 'shaken', classifyIntent('車検'));
    },
    '中古車 → info': () => {
      Test.assertEquals('info', 'info', classifyIntent('中古車'));
    },
    '在庫 → info': () => {
      Test.assertEquals('info', 'info', classifyIntent('在庫'));
    },
    'ちゅうこしゃ → info': () => {
      Test.assertEquals('info', 'info', classifyIntent('ちゅうこしゃ'));
    },
    '採用 → recruit': () => {
      Test.assertEquals('recruit', 'recruit', classifyIntent('採用'));
    }
  });
}

function test_ShopHours() {
  Test.run({
    'Sunday is closed day': () => {
      // 2026-04-26 is Sunday
      const d = new Date(2026, 3, 26);
      Test.assertTrue('sunday', ShopHours.isClosedDay(d));
    },
    'Weekday mid-day is not after-hours': () => {
      // 2026-04-22 (Wed) 14:00
      const d = new Date(2026, 3, 22, 14, 0);
      Test.assertEquals('open', false, ShopHours.isAfterHours(d));
    },
    'Before 9 AM is after-hours': () => {
      const d = new Date(2026, 3, 22, 8, 0);
      Test.assertTrue('early', ShopHours.isAfterHours(d));
    },
    'After 18:00 is after-hours': () => {
      const d = new Date(2026, 3, 22, 19, 0);
      Test.assertTrue('late', ShopHours.isAfterHours(d));
    },
    'Holiday 2026-05-05 (こどもの日) is closed': () => {
      const d = new Date(2026, 4, 5);
      Test.assertTrue('holiday', ShopHours.isHoliday(d));
    },
    'replyEtaMessage on holiday mentions 日祝休明け': () => {
      const d = new Date(2026, 4, 5, 14, 0); // 休み
      const msg = ShopHours.replyEtaMessage(d);
      Test.assertTrue('mentions 日祝休', msg.indexOf('日祝休') !== -1);
    },
    'replyEtaMessage after hours mentions 翌営業日': () => {
      const d = new Date(2026, 3, 22, 20, 0); // Wed 20:00
      const msg = ShopHours.replyEtaMessage(d);
      Test.assertTrue('mentions 翌営業日', msg.indexOf('翌営業日') !== -1);
    },
    'replyEtaMessage during business hours is 営業時間内': () => {
      const d = new Date(2026, 3, 22, 14, 0); // Wed 14:00
      const msg = ShopHours.replyEtaMessage(d);
      Test.assertTrue('mentions 営業時間内', msg.indexOf('営業時間内') !== -1);
    }
  });
}
