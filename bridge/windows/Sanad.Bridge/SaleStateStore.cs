using System;
using System.Data.SQLite;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace Sanad.Bridge
{
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

        public bool QueueBundle(string sourceKey, long invoiceId, string eventId, string bodyJson)
        {
            using (var transaction = _connection.BeginTransaction())
            {
                int inserted;
                using (var command = new SQLiteCommand(@"
insert or ignore into sale_outbox(
  event_id,source_key,invoice_id,body_protected,status,attempt_count,created_at_utc
) values(@event,@source,@invoice,@body,'pending',0,@created)", _connection, transaction))
                {
                    command.Parameters.AddWithValue("@event", eventId);
                    command.Parameters.AddWithValue("@source", sourceKey);
                    command.Parameters.AddWithValue("@invoice", invoiceId);
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

        private void EnsureSchema()
        {
            ExecuteNonQuery(@"
create table if not exists sale_source_watermarks (
  source_key text primary key,
  last_invoice_id integer not null,
  updated_at_utc text not null
);

create table if not exists sale_outbox (
  event_id text primary key,
  source_key text not null,
  invoice_id integer not null,
  body_protected blob not null,
  status text not null,
  attempt_count integer not null default 0,
  next_attempt_at_utc text null,
  last_error text null,
  created_at_utc text not null,
  sent_at_utc text null,
  ack_protected blob null,
  unique(source_key, invoice_id)
);
create index if not exists sale_outbox_pending_idx on sale_outbox(source_key,status,next_attempt_at_utc,created_at_utc);
");
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
