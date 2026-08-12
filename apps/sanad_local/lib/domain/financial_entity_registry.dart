class FinancialEntityDefinition {
  const FinancialEntityDefinition({
    required this.code,
    required this.arabicName,
    required this.shortName,
    required this.englishName,
    required this.logoAsset,
    required this.aliases,
    this.templateCodes = const [],
  });

  final String code;
  final String arabicName;
  final String shortName;
  final String englishName;
  final String? logoAsset;
  final List<String> aliases;
  final List<String> templateCodes;
}
class FinancialEntityRegistry {
  const FinancialEntityRegistry._();

  static const unknown = FinancialEntityDefinition(
    code: 'unknown',
    arabicName: 'جهة مالية غير معروفة',
    shortName: 'جهة غير معروفة',
    englishName: 'Unknown financial entity',
    logoAsset: null,
    aliases: ['unknown', 'other', 'جهة أخرى', 'غير معروف'],
  );

  static const entities = <FinancialEntityDefinition>[
    FinancialEntityDefinition(
      code: 'alomqy_mobile',
      arabicName: 'شركة العمقي للصرافة',
      shortName: 'العمقي موبايل',
      englishName: 'Al-Omqi Exchange',
      logoAsset: 'assets/financial_entities/alamqi-mobile.webp',
      aliases: ['alomqi', 'alomqy', 'amqi', 'al-omqi', 'العمقي', 'العمقي موبايل', 'العمقي جوال'],
      templateCodes: ['amqi_mobile_deposit_notice_v1', 'amqi_mobile_withdrawal_notice_v1'],
    ),
    FinancialEntityDefinition(
      code: 'al_busairi_mobile',
      arabicName: 'شركة البسيري للصرافة',
      shortName: 'البسيري موبايل',
      englishName: 'Al Busairi Exchange',
      logoAsset: 'assets/financial_entities/albasiri-mobile.webp',
      aliases: ['al_busairi', 'albasiri', 'busairi', 'البسيري', 'البسيري موبايل'],
    ),
    FinancialEntityDefinition(
      code: 'b_cash_wallet',
      arabicName: 'محفظة بي كاش',
      shortName: 'بي كاش',
      englishName: 'B Cash',
      logoAsset: 'assets/financial_entities/bcash.webp',
      aliases: ['bcash', 'b_cash', 'b cash', 'بي كاش', 'بيكاش'],
    ),
    FinancialEntityDefinition(
      code: 'kuraimi_haseb',
      arabicName: 'بنك الكريمي الإسلامي',
      shortName: 'الكريمي حاسب',
      englishName: 'Al Kuraimi Islamic Bank',
      logoAsset: 'assets/financial_entities/alkuraimi-hasib.webp',
      aliases: ['kuraimi_haseb', 'haseb', 'kuraimi', 'الكريمي', 'حاسب', 'الكريمي حاسب'],
      templateCodes: ['kuraimi_haseb_transaction_card_v1', 'kuraimi_haseb_balance_list_v1'],
    ),
    FinancialEntityDefinition(
      code: 'kuraimi_sar',
      arabicName: 'بنك الكريمي الإسلامي',
      shortName: 'الكريمي سعودي',
      englishName: 'Al Kuraimi Islamic Bank — SAR',
      logoAsset: 'assets/financial_entities/alkuraimi-saudi.webp',
      aliases: ['kuraimi_sar', 'الكريمي سعودي'],
    ),
    FinancialEntityDefinition(
      code: 'kuraimi_yer',
      arabicName: 'بنك الكريمي الإسلامي',
      shortName: 'الكريمي يمني',
      englishName: 'Al Kuraimi Islamic Bank — YER',
      logoAsset: 'assets/financial_entities/alkuraimi-yemeni.webp',
      aliases: ['kuraimi_yer', 'الكريمي يمني'],
    ),
    FinancialEntityDefinition(
      code: 'bin_dowal_exchange',
      arabicName: 'شركة بن دول للصرافة',
      shortName: 'بن دول صرافة',
      englishName: 'Bin Dowal Exchange',
      logoAsset: 'assets/financial_entities/bindawol-exchange.webp',
      aliases: ['bin_dowal', 'bindawol', 'bin dowal', 'بن دول', 'بن دول صرافة'],
      templateCodes: ['bin_dowal_account_transfer_v1', 'bin_dowal_credit_notice_v1'],
    ),
    FinancialEntityDefinition(
      code: 'bin_dowal_pay',
      arabicName: 'بن دول باي',
      shortName: 'بن دول باي',
      englishName: 'Bin Dowal Pay',
      logoAsset: 'assets/financial_entities/bindawol-pay.webp',
      aliases: ['bin_dowal_pay', 'bindawol pay', 'bin dowal pay', 'بن دول باي'],
      templateCodes: ['bin_dowal_pay_transfer_notice_v1'],
    ),
    FinancialEntityDefinition(
      code: 'al_qutaibi',
      arabicName: 'بنك القطيبي الإسلامي',
      shortName: 'القطيبي',
      englishName: 'Al Qutaibi Islamic Bank',
      logoAsset: 'assets/financial_entities/alqutaibi.webp',
      aliases: ['al_qutaibi', 'qutaibi', 'القطيبي'],
    ),
  ];

  static FinancialEntityDefinition resolve({String? code, String? name, String? currency}) {
    final codeKey = _normalize(code ?? '');
    final nameKey = _normalize(name ?? '');
    if (codeKey == 'kuraimi' || codeKey == 'kuraimi_haseb') {
      if (currency == 'SAR') return byCode('kuraimi_sar');
      if (currency == 'YER') return byCode('kuraimi_yer');
    }
    for (final entity in entities) {
      final candidates = [entity.code, entity.arabicName, entity.shortName, entity.englishName, ...entity.aliases];
      if (candidates.any((value) {
        final key = _normalize(value);
        return key == codeKey || key == nameKey || (key.length >= 4 && nameKey.contains(key));
      })) {
        return entity;
      }
    }
    return unknown;
  }

  static FinancialEntityDefinition byCode(String code) => entities.firstWhere(
        (entity) => entity.code == code,
        orElse: () => unknown,
      );

  static String canonicalCode(String? code, String? name, {String? currency}) =>
      resolve(code: code, name: name, currency: currency).code;

  static String arabicName(String? code, String? name, {String? currency}) =>
      resolve(code: code, name: name, currency: currency).arabicName;

  static String _normalize(String value) => value
      .toLowerCase()
      .replaceAll(RegExp(r'[\u064B-\u065F\u0670]'), '')
      .replaceAll(RegExp('[أإآ]'), 'ا')
      .replaceAll('ى', 'ي')
      .replaceAll('ة', 'ه')
      .replaceAll(RegExp(r'[^a-z0-9\u0600-\u06ff]+'), ' ')
      .trim()
      .replaceAll(' ', '_');
}
