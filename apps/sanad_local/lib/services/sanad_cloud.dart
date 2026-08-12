import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

const sanadSupabaseUrl = String.fromEnvironment(
  'SANAD_SUPABASE_URL',
  defaultValue: 'https://api.sanadflow.com',
);

const sanadSupabaseKey = String.fromEnvironment(
  'SANAD_SUPABASE_KEY',
  defaultValue: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1ZGJ6bGdjbGdobGhhemxkdWFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4NzI3NzEsImV4cCI6MjA5ODQ0ODc3MX0.mQvUtmAwmRXPdMJdynPemP56PSeONMUpw_k0rz_pUag',
);

Future<void> initializeSanadCloud() async {
  await Supabase.initialize(url: sanadSupabaseUrl, publishableKey: sanadSupabaseKey);
}

class SemanticAnalysisResult {
  const SemanticAnalysisResult({required this.structured, required this.latencyMs, required this.engine});
  final Map<String, dynamic> structured;
  final int latencyMs;
  final String engine;
}

class SanadSemanticAnalyzer {
  SanadSemanticAnalyzer({http.Client? client}) : _client = client ?? http.Client();
  final http.Client _client;

  bool get hasSession => Supabase.instance.client.auth.currentSession != null;

  Future<void> signIn({required String email, required String password}) async {
    await Supabase.instance.client.auth.signInWithPassword(email: email.trim(), password: password);
  }

  Future<void> signOut() => Supabase.instance.client.auth.signOut();

  Future<SemanticAnalysisResult> analyze({
    required String localOperationId,
    required String ocrText,
    required double ocrConfidence,
    required String ocrProvider,
    required int revision,
    required Map<String, dynamic> localHints,
  }) async {
    final session = Supabase.instance.client.auth.currentSession;
    if (session == null) throw StateError('sanad_auth_required');
    final uri = Uri.parse('$sanadSupabaseUrl/functions/v1/sanad-local-text-analysis');
    final response = await _client.post(
      uri,
      headers: {
        'content-type': 'application/json',
        'apikey': sanadSupabaseKey,
        'authorization': 'Bearer ${session.accessToken}',
      },
      body: jsonEncode({
        'local_operation_id': localOperationId,
        'analysis_revision': revision,
        'ocr_text': ocrText,
        'ocr_confidence': ocrConfidence,
        'ocr_provider': ocrProvider,
        'local_hints': localHints,
      }),
    ).timeout(const Duration(seconds: 35));

    final payload = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode < 200 || response.statusCode >= 300 || payload['ok'] != true) {
      throw StateError('semantic_analysis_failed:${payload['error'] ?? response.statusCode}');
    }
    return SemanticAnalysisResult(
      structured: Map<String, dynamic>.from(payload['structured'] as Map),
      latencyMs: (payload['latency_ms'] as num?)?.toInt() ?? 0,
      engine: payload['engine']?.toString() ?? 'sanad-local-text-v1',
    );
  }

  void dispose() => _client.close();
}
