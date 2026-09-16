using System;
using System.Collections.Generic;
using System.Data.SQLite;
using System.Globalization;
using System.IO;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;

namespace Sanad.Bridge
{
    internal sealed class BridgeStateStore : IDisposable
    {
        private static readonly byte[] OutboxEntropy = Encoding.UTF8.GetBytes("SANAD.Bridge.Outbox.v1");
        private readonly SQLiteConnection _connection;

        public static string DatabasePath
        {
            get
            {
                var directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "SANAD", "Bridge");
                return Path.Combine(directory, "bridge.db");
            }
        }

        public BridgeStateStore()
        {
            var path = DatabasePath;
            var directory = Path.GetDirectoryName(path);
            Directory.CreateDirectory(directory);
            var isNew = !File.Exists(path);
            if (isNew) SQLiteConnection.CreateFile(path);

            _connection = new SQLiteConnection("Data Source=" + path + ";Version=3;Pooling=True;");
            _connection.Open();
            ExecuteNonQuery("PRAGMA journal_mode=WAL;");
            ExecuteNonQuery("PRAGMA synchronous=FULL;");
            ExecuteNonQuery("PRAGMA foreign_keys=ON;");
            EnsureSchema();
            RestrictFile(path);
        }

        public LocalBaselineRun GetLatestBaseline(string sourceKey, string schemaFingerprint)
        {
            const string sql = @"
select baseline_public_id, source_key, schema_fingerprint, status, manifest_json, expected_counts_json, started_at_utc, completed_at_utc
from baseline_runs
where source_key = @source_key and schema_fingerprint = @schema_fingerprint
order by started_at_utc desc
limit 1";
            using (var command = new SQLiteCommand(sql, _connection))
            {
                command.Parameters.AddWithValue("@source_key", sourceKey);
                command.Parameters.AddWithValue("@schema_fingerprint", schemaFingerprint);
                using (var reader = command.ExecuteReader())
                {
                    if (!reader.Read()) return null;
                    return ReadBaseline(reader);
                }
            }
        }

        public void CreateBaseline(EdaaBaselinePackage package)
        {
            if (package == null) throw new ArgumentNullException(nameof(package));
            using (var transaction = _connection.BeginTransaction())
            {
                using (var command = new SQLiteCommand(@"
insert into baseline_runs (
  baseline_public_id, source_key, schema_fingerprint, status, manifest_json, expected_counts_json, started_at_utc
) values (@id,@source,@schema,'prepared',@manifest,@counts,@started)", _connection, transaction))
                {
                    command.Parameters.AddWithValue("@id", package.BaselinePublicId);
                    command.Parameters.AddWithValue("@source", package.SourceKey);
                    command.Parameters.AddWithValue("@schema", package.SchemaFingerprint);
                    command.Parameters.AddWithValue("@manifest", package.ManifestJson);
                    command.Parameters.AddWithValue("@counts", package.ExpectedCountsJson);
                    command.Parameters.AddWithValue("@started", UtcNowText());
                    command.ExecuteNonQuery();
                }

                foreach (var seed in package.Events)
                {
                    using (var command = new SQLiteCommand(@"
insert into outbox_events (
  event_id, baseline_public_id, body_protected, status, attempt_count, created_at_utc
) values (@event_id,@baseline,@body,'pending',0,@created)", _connection, transaction))
                    {
                        command.Parameters.AddWithValue("@event_id", seed.EventId);
                        command.Parameters.AddWithValue("@baseline", package.BaselinePublicId);
                        command.Parameters.Add("@body", System.Data.DbType.Binary).Value = Protect(seed.BodyJson);
                        command.Parameters.AddWithValue("@created", UtcNowText());
                        command.ExecuteNonQuery();
                    }
                }
                transaction.Commit();
            }
        }

        public void MarkBaselineUploading(string baselinePublicId)
        {
            ExecuteNonQuery("update baseline_runs set status='uploading' where baseline_public_id=@id and status <> 'completed'",
                new SQLiteParameter("@id", baselinePublicId));
        }

        public List<LocalOutboxItem> GetPendingEvents(string baselinePublicId)
        {
            var items = new List<LocalOutboxItem>();
            const string sql = @"
select event_id, body_protected, attempt_count
from outbox_events
where baseline_public_id=@baseline
  and status in ('pending','failed')
  and (next_attempt_at_utc is null or next_attempt_at_utc <= @now)
order by created_at_utc, event_id";
            using (var command = new SQLiteCommand(sql, _connection))
            {
                command.Parameters.AddWithValue("@baseline", baselinePublicId);
                command.Parameters.AddWithValue("@now", UtcNowText());
                using (var reader = command.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        items.Add(new LocalOutboxItem
                        {
                            EventId = reader.GetString(0),
                            BodyJson = Unprotect((byte[])reader[1]),
                            AttemptCount = reader.GetInt32(2)
                        });
                    }
                }
            }
            return items;
        }

        public int CountUnsentEvents(string baselinePublicId)
        {
            using (var command = new SQLiteCommand("select count(*) from outbox_events where baseline_public_id=@id and status <> 'sent'", _connection))
            {
                command.Parameters.AddWithValue("@id", baselinePublicId);
                return Convert.ToInt32(command.ExecuteScalar(), CultureInfo.InvariantCulture);
            }
        }

        public void MarkEventSent(string eventId, string ackJson)
        {
            using (var command = new SQLiteCommand(@"
update outbox_events
set status='sent', sent_at_utc=@sent, last_error=null, next_attempt_at_utc=null, ack_protected=@ack
where event_id=@id", _connection))
            {
                command.Parameters.AddWithValue("@sent", UtcNowText());
                command.Parameters.AddWithValue("@id", eventId);
                command.Parameters.Add("@ack", System.Data.DbType.Binary).Value = Protect(ackJson ?? "{}");
                command.ExecuteNonQuery();
            }
        }

        public void MarkEventFailed(string eventId, string errorCode, int currentAttemptCount)
        {
            var attempt = currentAttemptCount + 1;
            var seconds = Math.Min(300, Math.Max(5, (int)Math.Pow(2, Math.Min(attempt, 8))));
            var next = DateTime.UtcNow.AddSeconds(seconds).ToString("o", CultureInfo.InvariantCulture);
            using (var command = new SQLiteCommand(@"
update outbox_events
set status='failed', attempt_count=@attempt, last_error=@error, next_attempt_at_utc=@next
where event_id=@id", _connection))
            {
                command.Parameters.AddWithValue("@attempt", attempt);
                command.Parameters.AddWithValue("@error", (errorCode ?? "send_failed").Substring(0, Math.Min((errorCode ?? "send_failed").Length, 240)));
                command.Parameters.AddWithValue("@next", next);
                command.Parameters.AddWithValue("@id", eventId);
                command.ExecuteNonQuery();
            }
        }

        public void MarkBaselineCompleted(string baselinePublicId)
        {
            ExecuteNonQuery("update baseline_runs set status='completed', completed_at_utc=@completed where baseline_public_id=@id",
                new SQLiteParameter("@completed", UtcNowText()),
                new SQLiteParameter("@id", baselinePublicId));
        }

        private void EnsureSchema()
        {
            ExecuteNonQuery(@"
create table if not exists baseline_runs (
  baseline_public_id text primary key,
  source_key text not null,
  schema_fingerprint text not null,
  status text not null,
  manifest_json text not null,
  expected_counts_json text not null,
  started_at_utc text not null,
  completed_at_utc text null
);
create index if not exists baseline_runs_source_idx on baseline_runs(source_key, schema_fingerprint, started_at_utc);

create table if not exists outbox_events (
  event_id text primary key,
  baseline_public_id text not null references baseline_runs(baseline_public_id) on delete cascade,
  body_protected blob not null,
  status text not null,
  attempt_count integer not null default 0,
  next_attempt_at_utc text null,
  last_error text null,
  created_at_utc text not null,
  sent_at_utc text null,
  ack_protected blob null
);
create index if not exists outbox_events_pending_idx on outbox_events(status, next_attempt_at_utc, created_at_utc);
");
        }

        private static LocalBaselineRun ReadBaseline(SQLiteDataReader reader)
        {
            DateTime started;
            DateTime.TryParse(reader.GetString(6), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out started);
            DateTime completed;
            DateTime? completedValue = null;
            if (!reader.IsDBNull(7) && DateTime.TryParse(reader.GetString(7), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out completed))
                completedValue = completed;

            return new LocalBaselineRun
            {
                BaselinePublicId = reader.GetString(0),
                SourceKey = reader.GetString(1),
                SchemaFingerprint = reader.GetString(2),
                Status = reader.GetString(3),
                ManifestJson = reader.GetString(4),
                ExpectedCountsJson = reader.GetString(5),
                StartedAtUtc = started,
                CompletedAtUtc = completedValue
            };
        }

        private void ExecuteNonQuery(string sql, params SQLiteParameter[] parameters)
        {
            using (var command = new SQLiteCommand(sql, _connection))
            {
                if (parameters != null && parameters.Length > 0) command.Parameters.AddRange(parameters);
                command.ExecuteNonQuery();
            }
        }

        private static byte[] Protect(string value)
        {
            var plain = Encoding.UTF8.GetBytes(value ?? string.Empty);
            return ProtectedData.Protect(plain, OutboxEntropy, DataProtectionScope.LocalMachine);
        }

        private static string Unprotect(byte[] value)
        {
            var plain = ProtectedData.Unprotect(value, OutboxEntropy, DataProtectionScope.LocalMachine);
            return Encoding.UTF8.GetString(plain);
        }

        private static string UtcNowText()
        {
            return DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture);
        }

        private static void RestrictFile(string path)
        {
            try
            {
                var security = new FileSecurity();
                security.SetAccessRuleProtection(true, false);
                var currentUser = WindowsIdentity.GetCurrent().User;
                if (currentUser != null)
                    security.AddAccessRule(new FileSystemAccessRule(currentUser, FileSystemRights.FullControl, AccessControlType.Allow));
                var systemSid = new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null);
                security.AddAccessRule(new FileSystemAccessRule(systemSid, FileSystemRights.FullControl, AccessControlType.Allow));
                File.SetAccessControl(path, security);
            }
            catch
            {
                // Encrypted outbox bodies remain protected by DPAPI if ACL hardening is unavailable.
            }
        }

        public void Dispose()
        {
            _connection.Dispose();
        }
    }
}
