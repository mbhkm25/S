using System;
using System.Data.SQLite;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace Sanad.Bridge
{
    internal sealed class LocalSaleOutboxItem
    {
        public string EventId { get; set; }
        public string SourceKey { get; set; }
        public long InvoiceId { get; set; }
        public string Revision { get; set; }
        public string BodyJson { get; set; }
        public string Status { get; set; }
        public int AttemptCount { get; set; }
        public DateTime? NextAttemptAtUtc { get; set; }
        public string LastError { get; set; }
        public DateTime CreatedAtUtc { get; set; }
        public DateTime? SentAtUtc { get; set; }
        public string AckJson { get; set; }
    }

    internal sealed class SaleStateStore : IDisposable
    {
        private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("SANAD.Bridge.SaleOutbox.v1");
        private readonly SQLiteConnection _connection;

        public SaleStateStore()
        {
            _connection = new SQLiteConnection("Data Source=" + BridgeStateStore.DatabasePath + ";Version=3;Pooling=True;");
            _connection.Open();
            ExecuteNonQuery("PRAGMA journal_mode=WAL;");
            ExecuteNonQuery("PRAGMA synchronous=FULL;");
            EnsureSchema();
        }

        public long? GetWatermark(string sourceKey)
        {
            using (var command = new SQLiteCommand("select last_invoice_id from sale_source_watermarks where source_key=@source", _connection))
            {
                command.Parameters.AddWithValue("@source", sourceKey);
                var value = command.ExecuteScalar();
                if (value == null || value == DBNull.Value) return null;
                return Convert.ToInt64(value, CultureInfo.InvariantCulture);
            }
        }

        public void InitializeWatermark(string sourceKey, long invoiceId)
        {
            using (var command = new SQLiteCommand(@"
insert or ignore into sale_source_watermarks(source_key,last_invoice_id,updated_at_utc)
values(@source,@invoice,@updated)", _connection))
            {
                command.Parameters.AddWithValue("@source", sourceKey);
                command.Parameters.AddWithValue("@invoice", invoiceId);
                command.Parameters.AddWithValue("@updated", UtcNowText());
                command.ExecuteNonQuery();
            }
        }

        public bool QueueBundle(string sourceKey, long invoiceId, string revision, string eventId, string bodyJson)
        {
            if (string.IsNullOrWhiteSpace(revision)) throw new ArgumentException("revision is required", nameof(revision));
            using (var transaction = _connection.BeginTransaction())
            {
                int inserted;
                using (var command = new SQLiteCommand(@"
insert or ignore into sale_outbox(
  event_id,source_key,invoice_id,revision,body_protected,status,attempt_count,created_at_utc
) values(@event,@source,@invoice,@revision,@body,'pending',0,@created)", _connection, transaction))
                {
                    command.Parameters.AddWithValue("@event", eventId);
                    command.Parameters.AddWithValue("@source", sourceKey);
                    command.Parameters.AddWithValue("@invoice", invoiceId);
                    command.Parameters.AddWithValue("@revision", revision);
                    command.Parameters.Add("@body", System.Data.DbType.Binary).Value = Protect(bodyJson);
                    command.Parameters.AddWithValue("@created", UtcNowText());
                    inserted = command.ExecuteNonQuery();
                }

                using (var command = new SQLiteCommand(@"
update sale_source_watermarks
set last_invoice_id = case when last_invoice_id < @invoice then @invoice else last_invoice_id end,
    updated_at_utc=@updated
where source_key=@source", _connection, transaction))
                {
                    command.Parameters.AddWithValue("@invoice", invoiceId);
                    command.Parameters.AddWithValue("@updated", UtcNowText());
                    command.Parameters.AddWithValue("@source", sourceKey);
                    command.ExecuteNonQuery();
                }

                transaction.Commit();
                return inserted > 0;
            }
        }

        public int CountPending(string sourceKey)
        {
            using (var command = new SQLiteCommand("select count(*) from sale_outbox where source_key=@source and status in ('pending','failed')", _connection))
            {
                command.Parameters.AddWithValue("@source", sourceKey);
                return Convert.ToInt32(command.ExecuteScalar(), CultureInfo.InvariantCulture);
            }
        }

        public LocalSaleOutboxItem GetByInvoiceId(long invoiceId)
        {
            using (var command = new SQLiteCommand(@"
select event_id, source_key, invoice_id, revision, body_protected, status,
       attempt_count, next_attempt_at_utc, last_error,
       created_at_utc, sent_at_utc, ack_protected
from sale_outbox
where invoice_id=@invoice
order by created_at_utc desc
limit 1", _connection))
            {
                command.Parameters.AddWithValue("@invoice", invoiceId);
                using (var reader = command.ExecuteReader())
                {
                    return reader.Read() ? ReadOutboxItem(reader) : null;
                }
            }
        }

        public bool IsDue(LocalSaleOutboxItem item, DateTime utcNow)
        {
            if (item == null) return false;
            if (string.Equals(item.Status, "sent", StringComparison.OrdinalIgnoreCase)) return false;
            if (!string.Equals(item.Status, "pending", StringComparison.OrdinalIgnoreCase) &&
                !string.Equals(item.Status, "failed", StringComparison.OrdinalIgnoreCase)) return false;
            return !item.NextAttemptAtUtc.HasValue || item.NextAttemptAtUtc.Value <= utcNow;
        }

        public LocalSaleOutboxItem MarkFailed(string eventId, string errorCode)
        {
            var existing = GetByEventId(eventId);
            if (existing == null) throw new InvalidOperationException("sale_outbox_event_not_found");
            if (string.Equals(existing.Status, "sent", StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("sale_outbox_event_already_sent");

            var attempt = existing.AttemptCount + 1;
            var seconds = Math.Min(300, Math.Max(5, (int)Math.Pow(2, Math.Min(attempt, 8))));
            var next = DateTime.UtcNow.AddSeconds(seconds);
            var safeError = string.IsNullOrWhiteSpace(errorCode) ? "send_failed" : errorCode;
            if (safeError.Length > 240) safeError = safeError.Substring(0, 240);

            using (var command = new SQLiteCommand(@"
update sale_outbox
set status='failed',
    attempt_count=@attempt,
    next_attempt_at_utc=@next,
    last_error=@error,
    sent_at_utc=null,
    ack_protected=null
where event_id=@event and status <> 'sent'", _connection))
            {
                command.Parameters.AddWithValue("@attempt", attempt);
                command.Parameters.AddWithValue("@next", next.ToString("o", CultureInfo.InvariantCulture));
                command.Parameters.AddWithValue("@error", safeError);
                command.Parameters.AddWithValue("@event", eventId);
                command.ExecuteNonQuery();
            }

            return GetByEventId(eventId);
        }

        public LocalSaleOutboxItem MarkSent(string eventId, string ackJson)
        {
            var existing = GetByEventId(eventId);
            if (existing == null) throw new InvalidOperationException("sale_outbox_event_not_found");
            if (string.Equals(existing.Status, "sent", StringComparison.OrdinalIgnoreCase))
                return existing;

            using (var command = new SQLiteCommand(@"
update sale_outbox
set status='sent',
    next_attempt_at_utc=null,
    last_error=null,
    sent_at_utc=@sent,
    ack_protected=@ack
where event_id=@event", _connection))
            {
                command.Parameters.AddWithValue("@sent", UtcNowText());
                command.Parameters.Add("@ack", System.Data.DbType.Binary).Value = Protect(ackJson ?? "{}");
                command.Parameters.AddWithValue("@event", eventId);
                command.ExecuteNonQuery();
            }

            return GetByEventId(eventId);
        }

        private LocalSaleOutboxItem GetByEventId(string eventId)
        {
            using (var command = new SQLiteCommand(@"
select event_id, source_key, invoice_id, revision, body_protected, status,
       attempt_count, next_attempt_at_utc, last_error,
       created_at_utc, sent_at_utc, ack_protected
from sale_outbox
where event_id=@event
limit 1", _connection))
            {
                command.Parameters.AddWithValue("@event", eventId);
                using (var reader = command.ExecuteReader())
                {
                    return reader.Read() ? ReadOutboxItem(reader) : null;
                }
            }
        }

        private static LocalSaleOutboxItem ReadOutboxItem(SQLiteDataReader reader)
        {
            return new LocalSaleOutboxItem
            {
                EventId = reader.GetString(0),
                SourceKey = reader.GetString(1),
                InvoiceId = Convert.ToInt64(reader[2], CultureInfo.InvariantCulture),
                Revision = reader.GetString(3),
                BodyJson = Unprotect((byte[])reader[4]),
                Status = reader.GetString(5),
                AttemptCount = Convert.ToInt32(reader[6], CultureInfo.InvariantCulture),
                NextAttemptAtUtc = ParseUtc(reader, 7),
                LastError = reader.IsDBNull(8) ? null : reader.GetString(8),
                CreatedAtUtc = ParseUtc(reader, 9) ?? DateTime.MinValue,
                SentAtUtc = ParseUtc(reader, 10),
                AckJson = reader.IsDBNull(11) ? null : Unprotect((byte[])reader[11])
            };
        }

        private static DateTime? ParseUtc(SQLiteDataReader reader, int ordinal)
        {
            if (reader.IsDBNull(ordinal)) return null;
            DateTime parsed;
            return DateTime.TryParse(reader.GetString(ordinal), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out parsed)
                ? (DateTime?)parsed
                : null;
        }

        private void EnsureSchema()
        {
            ExecuteNonQuery(@"
create table if not exists sale_source_watermarks (
  source_key text primary key,
  last_invoice_id integer not null,
  updated_at_utc text not null
);
");

            if (!TableExists("sale_outbox"))
            {
                CreateRevisionAwareOutbox();
            }
            else if (!ColumnExists("sale_outbox", "revision"))
            {
                MigrateLegacyOutbox();
            }

            ExecuteNonQuery("create index if not exists sale_outbox_pending_idx on sale_outbox(source_key,status,next_attempt_at_utc,created_at_utc);");
        }

        private void CreateRevisionAwareOutbox()
        {
            ExecuteNonQuery(@"
create table sale_outbox (
  event_id text primary key,
  source_key text not null,
  invoice_id integer not null,
  revision text not null,
  body_protected blob not null,
  status text not null,
  attempt_count integer not null default 0,
  next_attempt_at_utc text null,
  last_error text null,
  created_at_utc text not null,
  sent_at_utc text null,
  ack_protected blob null,
  unique(source_key, invoice_id, revision)
);
");
        }

        private void MigrateLegacyOutbox()
        {
            using (var transaction = _connection.BeginTransaction())
            {
                using (var command = new SQLiteCommand(@"
create table sale_outbox_v2 (
  event_id text primary key,
  source_key text not null,
  invoice_id integer not null,
  revision text not null,
  body_protected blob not null,
  status text not null,
  attempt_count integer not null default 0,
  next_attempt_at_utc text null,
  last_error text null,
  created_at_utc text not null,
  sent_at_utc text null,
  ack_protected blob null,
  unique(source_key, invoice_id, revision)
);

insert into sale_outbox_v2(
  event_id,source_key,invoice_id,revision,body_protected,status,attempt_count,
  next_attempt_at_utc,last_error,created_at_utc,sent_at_utc,ack_protected
)
select
  event_id,source_key,invoice_id,'legacy:' || invoice_id,body_protected,status,attempt_count,
  next_attempt_at_utc,last_error,created_at_utc,sent_at_utc,ack_protected
from sale_outbox;

drop table sale_outbox;
alter table sale_outbox_v2 rename to sale_outbox;
", _connection, transaction))
                {
                    command.ExecuteNonQuery();
                }
                transaction.Commit();
            }
        }

        private bool TableExists(string tableName)
        {
            using (var command = new SQLiteCommand("select count(*) from sqlite_master where type='table' and name=@name", _connection))
            {
                command.Parameters.AddWithValue("@name", tableName);
                return Convert.ToInt32(command.ExecuteScalar(), CultureInfo.InvariantCulture) > 0;
            }
        }

        private bool ColumnExists(string tableName, string columnName)
        {
            using (var command = new SQLiteCommand("pragma table_info(" + tableName + ")", _connection))
            using (var reader = command.ExecuteReader())
            {
                while (reader.Read())
                {
                    if (string.Equals(Convert.ToString(reader[1], CultureInfo.InvariantCulture), columnName, StringComparison.OrdinalIgnoreCase))
                        return true;
                }
            }
            return false;
        }

        private void ExecuteNonQuery(string sql)
        {
            using (var command = new SQLiteCommand(sql, _connection))
                command.ExecuteNonQuery();
        }

        private static byte[] Protect(string value)
        {
            var plain = Encoding.UTF8.GetBytes(value ?? string.Empty);
            return ProtectedData.Protect(plain, Entropy, DataProtectionScope.LocalMachine);
        }

        private static string Unprotect(byte[] protectedBytes)
        {
            var plain = ProtectedData.Unprotect(protectedBytes, Entropy, DataProtectionScope.LocalMachine);
            return Encoding.UTF8.GetString(plain);
        }

        private static string UtcNowText()
        {
            return DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture);
        }

        public void Dispose()
        {
            _connection.Dispose();
        }
    }
}
