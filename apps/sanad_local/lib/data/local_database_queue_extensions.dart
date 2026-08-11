import 'local_database.dart';

extension LocalDatabaseQueueExtensions on LocalDatabase {
  Future<void> markJobWaitingAuth(int id) async {
    final db = await database;
    await db.update('local_jobs', {
      'status': 'waiting_auth',
      'last_error': null,
      'next_attempt_at': null,
      'updated_at': DateTime.now().toUtc().toIso8601String(),
    }, where: 'id = ?', whereArgs: [id]);
  }

  Future<void> resumeWaitingAuthJobs() async {
    final db = await database;
    await db.update('local_jobs', {
      'status': 'queued',
      'next_attempt_at': null,
      'last_error': null,
      'updated_at': DateTime.now().toUtc().toIso8601String(),
    }, where: "status = 'waiting_auth'");
  }
}
