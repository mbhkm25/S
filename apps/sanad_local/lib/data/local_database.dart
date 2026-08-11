import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

import '../domain/local_operation.dart';

class LocalDatabase {
  LocalDatabase._();
  static final LocalDatabase instance = LocalDatabase._();

  Database? _db;

  Future<Database> get database async => _db ??= await _open();

  Future<Database> _open() async {
    final root = await getDatabasesPath();
    final path = p.join(root, 'sanad_local.db');
    return openDatabase(
      path,
      version: 1,
      onConfigure: (db) async {
        await db.execute('PRAGMA foreign_keys = ON');
        await db.execute('PRAGMA journal_mode = WAL');
        await db.execute('PRAGMA synchronous = NORMAL');
      },
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE local_operations (
            id TEXT PRIMARY KEY,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            status TEXT NOT NULL,
            image_path TEXT NOT NULL,
            file_sha256 TEXT,
            ocr_text TEXT,
            ocr_confidence REAL,
            ocr_provider TEXT,
            analysis_revision INTEGER NOT NULL DEFAULT 1,
            financial_entity TEXT,
            financial_entity_code TEXT,
            amount REAL,
            currency TEXT,
            reference_number TEXT,
            transaction_datetime TEXT,
            receiver_name TEXT,
            receiver_identifier_type TEXT,
            receiver_identifier_value TEXT,
            analysis_json TEXT,
            analysis_warnings TEXT NOT NULL DEFAULT '[]',
            analysis_confidence REAL,
            cloud_operation_id TEXT
          )
        ''');
        await db.execute('CREATE INDEX idx_local_operations_created_at ON local_operations(created_at DESC)');
        await db.execute('CREATE INDEX idx_local_operations_status ON local_operations(status)');
        await db.execute('CREATE INDEX idx_local_operations_reference ON local_operations(reference_number)');
        await db.execute('CREATE INDEX idx_local_operations_amount ON local_operations(amount)');

        await db.execute('''
          CREATE TABLE local_operation_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            operation_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            payload_json TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(operation_id) REFERENCES local_operations(id) ON DELETE CASCADE
          )
        ''');
        await db.execute('CREATE INDEX idx_local_events_operation ON local_operation_events(operation_id, created_at)');

        await db.execute('''
          CREATE TABLE local_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            operation_id TEXT NOT NULL,
            job_type TEXT NOT NULL,
            status TEXT NOT NULL,
            attempt_count INTEGER NOT NULL DEFAULT 0,
            next_attempt_at TEXT,
            last_error TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(operation_id, job_type),
            FOREIGN KEY(operation_id) REFERENCES local_operations(id) ON DELETE CASCADE
          )
        ''');
        await db.execute('CREATE INDEX idx_local_jobs_ready ON local_jobs(status, next_attempt_at)');

        await db.execute('''
          CREATE TABLE local_shift_sessions (
            id TEXT PRIMARY KEY,
            started_at TEXT NOT NULL,
            ended_at TEXT,
            label TEXT,
            is_open INTEGER NOT NULL DEFAULT 1
          )
        ''');
      },
    );
  }

  Future<void> insertOperation(LocalOperation operation) async {
    final db = await database;
    await db.transaction((txn) async {
      await txn.insert('local_operations', operation.toDb(), conflictAlgorithm: ConflictAlgorithm.abort);
      await txn.insert('local_operation_events', {
        'operation_id': operation.id,
        'event_type': 'captured',
        'payload_json': null,
        'created_at': DateTime.now().toUtc().toIso8601String(),
      });
      await txn.insert('local_jobs', {
        'operation_id': operation.id,
        'job_type': 'ocr_and_analyze',
        'status': 'queued',
        'attempt_count': 0,
        'created_at': DateTime.now().toUtc().toIso8601String(),
        'updated_at': DateTime.now().toUtc().toIso8601String(),
      });
    });
  }

  Future<void> updateOperation(LocalOperation operation, {String? eventType}) async {
    final db = await database;
    await db.transaction((txn) async {
      await txn.update('local_operations', operation.toDb(), where: 'id = ?', whereArgs: [operation.id]);
      if (eventType != null) {
        await txn.insert('local_operation_events', {
          'operation_id': operation.id,
          'event_type': eventType,
          'payload_json': null,
          'created_at': DateTime.now().toUtc().toIso8601String(),
        });
      }
    });
  }

  Future<LocalOperation?> getOperation(String id) async {
    final db = await database;
    final rows = await db.query('local_operations', where: 'id = ?', whereArgs: [id], limit: 1);
    return rows.isEmpty ? null : LocalOperation.fromDb(rows.first);
  }

  Future<List<LocalOperation>> recentOperations({int limit = 100}) async {
    final db = await database;
    final rows = await db.query('local_operations', orderBy: 'created_at DESC', limit: limit);
    return rows.map(LocalOperation.fromDb).toList();
  }

  Future<List<LocalOperation>> searchOperations(String query, {int limit = 100}) async {
    final db = await database;
    final value = query.trim();
    if (value.isEmpty) return recentOperations(limit: limit);
    final like = '%$value%';
    final amount = double.tryParse(value.replaceAll(',', ''));
    final rows = await db.query(
      'local_operations',
      where: amount == null
          ? '(reference_number LIKE ? OR financial_entity LIKE ? OR receiver_name LIKE ? OR currency LIKE ?)'
          : '(amount = ? OR reference_number LIKE ? OR financial_entity LIKE ? OR receiver_name LIKE ?)',
      whereArgs: amount == null ? [like, like, like, like] : [amount, like, like, like],
      orderBy: 'created_at DESC',
      limit: limit,
    );
    return rows.map(LocalOperation.fromDb).toList();
  }

  Future<Map<String, num>> todaySummary() async {
    final db = await database;
    final now = DateTime.now();
    final start = DateTime(now.year, now.month, now.day).toUtc().toIso8601String();
    final rows = await db.rawQuery('''
      SELECT currency, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
      FROM local_operations
      WHERE created_at >= ? AND status IN ('analyzed', 'review_required', 'synced', 'promoted_to_cloud')
      GROUP BY currency
    ''', [start]);
    final out = <String, num>{};
    for (final row in rows) {
      final currency = (row['currency'] as String?) ?? 'UNKNOWN';
      out['count_$currency'] = (row['count'] as num?) ?? 0;
      out['total_$currency'] = (row['total'] as num?) ?? 0;
    }
    final countRow = await db.rawQuery('SELECT COUNT(*) AS c FROM local_operations WHERE created_at >= ?', [start]);
    out['operations'] = (countRow.first['c'] as num?) ?? 0;
    return out;
  }

  Future<Map<String, Object?>?> nextReadyJob() async {
    final db = await database;
    final now = DateTime.now().toUtc().toIso8601String();
    final rows = await db.query(
      'local_jobs',
      where: "status IN ('queued','retry_wait') AND (next_attempt_at IS NULL OR next_attempt_at <= ?)",
      whereArgs: [now],
      orderBy: 'created_at ASC',
      limit: 1,
    );
    return rows.isEmpty ? null : rows.first;
  }

  Future<void> markJobRunning(int id) async {
    final db = await database;
    await db.update('local_jobs', {
      'status': 'running',
      'updated_at': DateTime.now().toUtc().toIso8601String(),
    }, where: 'id = ?', whereArgs: [id]);
  }

  Future<void> markJobDone(int id) async {
    final db = await database;
    await db.update('local_jobs', {
      'status': 'done',
      'last_error': null,
      'updated_at': DateTime.now().toUtc().toIso8601String(),
    }, where: 'id = ?', whereArgs: [id]);
  }

  Future<void> markJobRetry(int id, int attempts, Object error) async {
    final db = await database;
    final delayMinutes = attempts <= 1 ? 1 : attempts <= 3 ? 3 : 10;
    final message = error.toString();
    final safeMessage = message.length <= 500 ? message : message.substring(0, 500);
    await db.update('local_jobs', {
      'status': 'retry_wait',
      'attempt_count': attempts,
      'next_attempt_at': DateTime.now().add(Duration(minutes: delayMinutes)).toUtc().toIso8601String(),
      'last_error': safeMessage,
      'updated_at': DateTime.now().toUtc().toIso8601String(),
    }, where: 'id = ?', whereArgs: [id]);
  }

  Future<void> recoverInterruptedJobs() async {
    final db = await database;
    await db.update('local_jobs', {
      'status': 'queued',
      'updated_at': DateTime.now().toUtc().toIso8601String(),
    }, where: "status = 'running'");
  }

  Future<void> close() async {
    final db = _db;
    _db = null;
    await db?.close();
  }
}
