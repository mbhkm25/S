import '../domain/financial_entity_registry.dart';
import 'local_ocr_service.dart';

/// Local port of SANAD's Financial Extraction Contract. It applies the same
/// entity codes, reference separation, evidence rule, and critical-field gate
/// before optional semantic completion. It never creates a Cloud operation.
class LocalFinancialAnalyzer {
  const LocalFinancialAnalyzer();

  Map<String, dynamic> analyzeDeterministically(
    String rawText, {
    required double ocrConfidence,
  }) {
    final text = normalizeOcrText(rawText);
    final entity = _detectEntity(text);
    final templateCode = _detectTemplate(text, entity.code);
    final currency = _extractCurrency(text);
    final amountCandidates = _amountCandidates(text, entity.code);
    final amount = amountCandidates.isEmpty ? null : amountCandidates.first;
    final references = _extractReferences(text, entity.code);
    final transactionType = _transactionType(text);
    final parties = _extractParties(text, entity.code);
    final warnings = <String>[];

    if (amountCandidates.length > 1) warnings.add('multiple_amount_candidates');
    if (references.candidateCount > 1) warnings.add('multiple_reference_candidates');
    if (ocrConfidence < .72) warnings.add('local_ocr_insufficient');

    final criticalComplete = entity.code != 'unknown' &&
        amount != null &&
        currency != null &&
        (references.documentReference != null || references.transferReference != null);
    if (!criticalComplete) warnings.add('critical_field_unresolved');

    final fieldConfidence = <String, double>{
      'financialEntity': entity.code == 'unknown' ? 0 : .98,
      'amount': amount == null ? 0 : .96,
      'currency': currency == null ? 0 : .98,
      'documentReference': references.documentReference == null ? 0 : .97,
      'transferReference': references.transferReference == null ? 0 : .97,
    };
    final present = fieldConfidence.values.where((value) => value > 0).toList();
    final rulesConfidence = present.isEmpty ? 0.0 : present.reduce((a, b) => a + b) / present.length;
    final confidence = ((rulesConfidence * .78) + (ocrConfidence * .22)).clamp(0.0, 1.0).toDouble();
    if (!criticalComplete) warnings.add('deterministic_partial_extraction');

    return {
      'schemaVersion': 2,
      'templateCode': templateCode,
      'templateVersion': 1,
      'financialEntity': entity.arabicName,
      'financialEntityCode': entity.code,
      'transactionType': transactionType,
      'transactionDirection': _transactionDirection(transactionType),
      'amount': amount,
      'currency': currency,
      'documentReference': references.documentReference,
      'transferReference': references.transferReference,
      'transactionDatetime': _extractDatetime(text),
      'parties': parties,
      'confidence': confidence,
      'fieldConfidence': fieldConfidence,
      'warnings': warnings.toSet().toList(),
      'reviewRequired': !criticalComplete || warnings.isNotEmpty || confidence < .90,
      'quality': {
        'criticalComplete': criticalComplete,
        'evidenceValidated': true,
        'source': 'local_financial_rules_v2',
      },
    };
  }

  Map<String, dynamic> mergeSemanticWithEvidence({
    required Map<String, dynamic> deterministic,
    required Map<String, dynamic> semantic,
    required String ocrText,
    required double ocrConfidence,
  }) {
    final merged = <String, dynamic>{...semantic};
    final warnings = <String>{
      ...(deterministic['warnings'] as List<dynamic>? ?? const []).map((e) => e.toString()),
      ...(semantic['warnings'] as List<dynamic>? ?? const []).map((e) => e.toString()),
    };

    for (final field in const [
      'templateCode',
      'transactionType',
      'transactionDirection',
      'amount',
      'currency',
      'documentReference',
      'transferReference',
      'transactionDatetime',
    ]) {
      final deterministicValue = deterministic[field];
      if (deterministicValue != null && deterministicValue.toString().isNotEmpty) {
        merged[field] = deterministicValue;
      } else if (!_hasEvidence(ocrText, semantic[field])) {
        merged[field] = null;
        if (semantic[field] != null) warnings.add('identifier_rejected_not_supported_by_ocr_evidence');
      }
    }

    final entity = FinancialEntityRegistry.resolve(
      code: deterministic['financialEntityCode']?.toString() ?? semantic['financialEntityCode']?.toString(),
      name: deterministic['financialEntity']?.toString() ?? semantic['financialEntity']?.toString(),
      currency: merged['currency']?.toString(),
    );
    merged['financialEntityCode'] = entity.code;
    merged['financialEntity'] = entity.arabicName;
    merged['parties'] = _validateParties(semantic['parties'], ocrText);
    if ((merged['parties'] as List).isEmpty && deterministic['parties'] is List) {
      merged['parties'] = deterministic['parties'];
    }

    final criticalComplete = entity.code != 'unknown' &&
        (merged['amount'] as num?) != null &&
        (merged['amount'] as num) > 0 &&
        merged['currency'] != null &&
        (merged['documentReference'] != null || merged['transferReference'] != null);
    if (!criticalComplete) warnings.add('critical_field_unresolved');
    if (ocrConfidence < .72) warnings.add('ocr_confidence_below_automatic_threshold');

    final semanticConfidence = (semantic['confidence'] as num?)?.toDouble() ?? 0;
    final deterministicConfidence = (deterministic['confidence'] as num?)?.toDouble() ?? 0;
    merged['schemaVersion'] = 2;
    merged['confidence'] = semanticConfidence > deterministicConfidence ? semanticConfidence : deterministicConfidence;
    merged['warnings'] = warnings.toList();
    merged['reviewRequired'] = semantic['reviewRequired'] == true ||
        !criticalComplete ||
        warnings.any((warning) => const {
              'critical_field_unresolved',
              'local_ocr_insufficient',
              'ocr_confidence_below_automatic_threshold',
            }.contains(warning));
    merged['quality'] = {
      'criticalComplete': criticalComplete,
      'evidenceValidated': true,
      'source': 'local_rules_plus_semantic_v2',
    };
    return merged;
  }

  FinancialEntityDefinition _detectEntity(String text) {
    final normalized = text.toLowerCase();
    if (RegExp(r'(العمقي|alomq|alomqy|amqi)', caseSensitive: false).hasMatch(normalized)) {
      return FinancialEntityRegistry.byCode('alomqy_mobile');
    }
    if (RegExp(r'(الكريمي|kuraimi|haseb|حاسب)', caseSensitive: false).hasMatch(normalized)) {
      if (_extractCurrency(text) == 'SAR') return FinancialEntityRegistry.byCode('kuraimi_sar');
      if (_extractCurrency(text) == 'YER') return FinancialEntityRegistry.byCode('kuraimi_yer');
      return FinancialEntityRegistry.byCode('kuraimi_haseb');
    }
    if (RegExp(r'(bin\s*dowal\s*pay|بن\s*دول\s*باي)', caseSensitive: false).hasMatch(normalized)) {
      return FinancialEntityRegistry.byCode('bin_dowal_pay');
    }
    if (RegExp(r'(bin\s*dowal|بن\s*دول)', caseSensitive: false).hasMatch(normalized)) {
      return FinancialEntityRegistry.byCode('bin_dowal_exchange');
    }
    if (RegExp(r'(البسيري|busairi|basiri)', caseSensitive: false).hasMatch(normalized)) {
      return FinancialEntityRegistry.byCode('al_busairi_mobile');
    }
    if (RegExp(r'(بي\s*كاش|bcash|b\s*cash)', caseSensitive: false).hasMatch(normalized)) {
      return FinancialEntityRegistry.byCode('b_cash_wallet');
    }
    if (RegExp(r'(القطيبي|qutaibi)', caseSensitive: false).hasMatch(normalized)) {
      return FinancialEntityRegistry.byCode('al_qutaibi');
    }
    return FinancialEntityRegistry.unknown;
  }

  String _detectTemplate(String text, String entityCode) {
    if (entityCode == 'alomqy_mobile') {
      if (RegExp(r'إشعار\s*سحب').hasMatch(text)) return 'amqi_mobile_withdrawal_notice_v1';
      if (RegExp(r'إشعار\s*إيداع').hasMatch(text)) return 'amqi_mobile_deposit_notice_v1';
    }
    if (entityCode.startsWith('kuraimi')) {
      if (RegExp(r'(Fund\s*Transfer|FT[A-Z0-9]{6,})', caseSensitive: false).hasMatch(text)) {
        return 'kuraimi_haseb_transaction_card_v1';
      }
    }
    if (entityCode == 'bin_dowal_pay') return 'bin_dowal_pay_transfer_notice_v1';
    if (entityCode == 'bin_dowal_exchange') {
      if (text.contains('إشعار دائن')) return 'bin_dowal_credit_notice_v1';
      if (text.contains('سند تحويل لحساب')) return 'bin_dowal_account_transfer_v1';
    }
    return 'unknown';
  }

  List<double> _amountCandidates(String text, String entityCode) {
    final results = <double>[];
    final patterns = <RegExp>[
      RegExp(r'(?:المبلغ|مبلغ الحساب|Amount)\s*[:#\-]*\s*#?([0-9][0-9,]*(?:\.[0-9]{1,2})?)#?', caseSensitive: false),
      if (entityCode == 'alomqy_mobile') RegExp(r'#\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*#'),
      RegExp(r'([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:YER|SAR|USD|ريال\s*يمني|ريال\s*سعودي|سعودي|دولار)', caseSensitive: false),
    ];
    for (final pattern in patterns) {
      for (final match in pattern.allMatches(text)) {
        final value = double.tryParse((match.group(1) ?? '').replaceAll(',', ''));
        if (value != null && value > 0 && !results.contains(value)) results.add(value);
      }
      if (results.isNotEmpty) break;
    }
    return results;
  }

  String? _extractCurrency(String text) {
    if (RegExp(r'\bSAR\b|ريال\s*سعودي|سعودي', caseSensitive: false).hasMatch(text)) return 'SAR';
    if (RegExp(r'\bYER\b|ريال\s*يمني|يمني', caseSensitive: false).hasMatch(text)) return 'YER';
    if (RegExp(r'\bUSD\b|دولار', caseSensitive: false).hasMatch(text)) return 'USD';
    return null;
  }

  _ReferenceResult _extractReferences(String text, String entityCode) {
    final candidates = <String>[];
    String? documentReference;
    String? transferReference;
    if (entityCode == 'alomqy_mobile') {
      final matches = RegExp(r'\b[0-9]+-[0-9]{6,12}\b').allMatches(text).map((m) => m.group(0)!).toList();
      candidates.addAll(matches);
      documentReference = matches.isEmpty ? null : matches.first;
    } else if (entityCode.startsWith('kuraimi')) {
      final ft = RegExp(r'\bFT[A-Z0-9]{6,}\b', caseSensitive: false).firstMatch(text)?.group(0);
      if (ft != null) {
        transferReference = ft.toUpperCase();
        candidates.add(ft);
      }
      documentReference = _labelledReference(text, const ['رقم الإشعار', 'رقم السند', 'رقم المرجع']);
      if (documentReference != null && documentReference != transferReference) candidates.add(documentReference);
    } else {
      documentReference = _labelledReference(text, const ['رقم الإشعار', 'رقم السند', 'المرجع']);
      transferReference = _labelledReference(text, const ['رقم الحوالة', 'رقم الحواله']);
      if (documentReference != null) candidates.add(documentReference);
      if (transferReference != null && transferReference != documentReference) candidates.add(transferReference);
    }
    return _ReferenceResult(
      documentReference: documentReference,
      transferReference: transferReference,
      candidateCount: candidates.toSet().length,
    );
  }

  String? _labelledReference(String text, List<String> labels) {
    for (final label in labels) {
      final match = RegExp('${RegExp.escape(label)}\\s*[:#\-]*\\s*([A-Z0-9-]{4,})', caseSensitive: false).firstMatch(text);
      if (match != null) return match.group(1);
    }
    return null;
  }

  String _transactionType(String text) {
    if (RegExp(r'(إشعار\s*إيداع|قيدنا\s*لحسابكم)').hasMatch(text)) return 'deposit';
    if (RegExp(r'(إشعار\s*سحب|قيدنا\s*على\s*حسابكم)').hasMatch(text)) return 'withdrawal';
    if (RegExp(r'(إشعار\s*دائن)').hasMatch(text)) return 'credit_notice';
    if (RegExp(r'(دفع|Payment|مشتريات)', caseSensitive: false).hasMatch(text)) return 'payment';
    if (RegExp(r'(تحويل|Transfer)', caseSensitive: false).hasMatch(text)) return 'transfer';
    return 'unknown';
  }

  String _transactionDirection(String type) => switch (type) {
        'deposit' || 'credit_notice' => 'incoming',
        'withdrawal' || 'payment' => 'outgoing',
        'transfer' => 'internal',
        _ => 'unknown',
      };

  String? _extractDatetime(String text) {
    final date = RegExp(r'\b(20[0-9]{2})[-/\.]([01]?[0-9])[-/\.]([0-3]?[0-9])\b').firstMatch(text);
    if (date == null) return null;
    final time = RegExp(r'\b([0-2]?[0-9])[:!]([0-5][0-9])\s*(AM|PM|ص|م)?\b', caseSensitive: false).firstMatch(text);
    final ymd = '${date.group(1)}-${date.group(2)!.padLeft(2, '0')}-${date.group(3)!.padLeft(2, '0')}';
    if (time == null) return '${ymd}T00:00:00';
    var hour = int.parse(time.group(1)!);
    final period = time.group(3)?.toUpperCase();
    if ((period == 'PM' || period == 'م') && hour < 12) hour += 12;
    if ((period == 'AM' || period == 'ص') && hour == 12) hour = 0;
    return '${ymd}T${hour.toString().padLeft(2, '0')}:${time.group(2)}:00';
  }

  List<Map<String, dynamic>> _extractParties(String text, String entityCode) {
    if (entityCode != 'alomqy_mobile') return const [];
    final flow = RegExp(
      r'من\s*حساب\s*:?\s*(.+?)\s*(?:/|-)?\s*(?:جواز|بط(?:اقة)?)?\s*-?\s*([0-9]{6,})?.*?رقم\s*-?\s*([0-9]{6,}).*?[اإآا]لى\s*حساب\s*:?\s*(.+?)(?:\s*بط\s*-?\s*([0-9]{6,}))?\s*رقم\s*-?\s*([0-9]{6,})',
    ).firstMatch(text);
    if (flow == null) return const [];
    return [
      {
        'role': 'sender',
        'name': flow.group(1)?.trim(),
        'identifiers': [
          if (flow.group(3) != null) _identifier('account_number', flow.group(3)!, 'رقم حساب المرسل'),
        ],
      },
      {
        'role': 'receiver',
        'name': flow.group(4)?.trim(),
        'identifiers': [
          if (flow.group(5) != null) _identifier('card_number', flow.group(5)!, 'رقم بطاقة المستلم'),
          if (flow.group(6) != null) _identifier('account_number', flow.group(6)!, 'رقم حساب المستلم', primary: true),
        ],
      },
    ];
  }

  Map<String, dynamic> _identifier(String type, String value, String label, {bool primary = false}) => {
        'type': type,
        'value': value,
        'sourceLabel': label,
        'isPrimaryRoutingIdentifier': primary,
        'confidence': .97,
        'evidence': [
          {'source': 'regex', 'text': value, 'rule': 'local:$type'},
        ],
      };

  List<Map<String, dynamic>> _validateParties(dynamic rawParties, String ocrText) {
    if (rawParties is! List) return const [];
    final out = <Map<String, dynamic>>[];
    for (final raw in rawParties.whereType<Map>()) {
      final party = Map<String, dynamic>.from(raw);
      final identifiers = <Map<String, dynamic>>[];
      final rawIdentifiers = party['identifiers'];
      if (rawIdentifiers is List) {
        for (final item in rawIdentifiers.whereType<Map>()) {
          final identifier = Map<String, dynamic>.from(item);
          if (_hasEvidence(ocrText, identifier['value'])) identifiers.add(identifier);
        }
      }
      final name = party['name'];
      if (name != null && !_hasEvidence(ocrText, name)) party['name'] = null;
      party['identifiers'] = identifiers;
      if (party['name'] != null || identifiers.isNotEmpty) out.add(party);
    }
    return out;
  }

  bool _hasEvidence(String source, dynamic value) {
    if (value == null || value.toString().trim().isEmpty) return true;
    final sourceKey = _evidenceKey(source);
    final valueKey = _evidenceKey(value.toString());
    if (value is num) {
      return _allNumbers(source).any((candidate) => (candidate - value.toDouble()).abs() < .001);
    }
    return valueKey.length >= 3 && sourceKey.contains(valueKey);
  }

  String _evidenceKey(String value) => normalizeOcrText(value)
      .toLowerCase()
      .replaceAll(RegExp(r'[^a-z0-9\u0600-\u06ff]'), '');

  List<double> _allNumbers(String value) => RegExp(r'[0-9][0-9,]*(?:\.[0-9]+)?')
      .allMatches(normalizeOcrText(value))
      .map((match) => double.tryParse(match.group(0)!.replaceAll(',', '')))
      .whereType<double>()
      .toList();
}

class _ReferenceResult {
  const _ReferenceResult({
    required this.documentReference,
    required this.transferReference,
    required this.candidateCount,
  });

  final String? documentReference;
  final String? transferReference;
  final int candidateCount;
}
