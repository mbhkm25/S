using System;
using System.Data.SQLite;
using System.Globalization;

namespace Sanad.Bridge
{
    internal sealed partial class SaleStateStore
    {
        private void EnsureObservedRevisionSchema()
        {
            ExecuteNonQuery(@"
create table if not exists sale_observed_revisions (
  source_key text not null,
  invoice_id integer not null,
  revision text not null,
  observed_at_utc text not null,
  primary key (source_key, invoice_id)
);
create index if not exists sale_observed_revisions_source_idx
  on sale_observed_revisions(source_key, invoice_id);
");
        }

        public string GetObservedRevision(string sourceKey, long invoiceId)
        {
            EnsureObservedRevisionSchema();
            using (var command = new SQLiteCommand(@"
select revision
from sale_observed_revisions
where source_key=@source and invoice_id=@invoice
limit 1", _connection))
            {
                command.Parameters.AddWithValue("@source", sourceKey);
                command.Parameters.AddWithValue("@invoice", invoiceId);
                var value = command.ExecuteScalar();
                return value == null || value == DBNull.Value ? null : Convert.ToString(value, CultureInfo.InvariantCulture);
            }
        }

        public void RecordObservedRevision(string sourceKey, long invoiceId, string revision)
        {
            if (string.IsNullOrWhiteSpace(revision)) throw new ArgumentException("revision is required", nameof(revision));
            EnsureObservedRevisionSchema();
            using (var command = new SQLiteCommand(@"
insert or replace into sale_observed_revisions(source_key,invoice_id,revision,observed_at_utc)
values(@source,@invoice,@revision,@observed)", _connection))
            {
                command.Parameters.AddWithValue("@source", sourceKey);
                command.Parameters.AddWithValue("@invoice", invoiceId);
                command.Parameters.AddWithValue("@revision", revision);
                command.Parameters.AddWithValue("@observed", UtcNowText());
                command.ExecuteNonQuery();
            }
        }

        public int SuppressHistoricalPendingThrough(string sourceKey, long throughInvoiceId)
        {
            EnsureObservedRevisionSchema();

            using (var transaction = _connection.BeginTransaction())
            {
                using (var seed = new SQLiteCommand(@"
insert or replace into sale_observed_revisions(source_key,invoice_id,revision,observed_at_utc)
select o.source_key, o.invoice_id, o.revision, @observed
from sale_outbox o
where o.source_key=@source
  and o.invoice_id <= @through
  and o.created_at_utc = (
    select max(i.created_at_utc)
    from sale_outbox i
    where i.source_key=o.source_key and i.invoice_id=o.invoice_id
  )", _connection, transaction))
                {
                    seed.Parameters.AddWithValue("@source", sourceKey);
                    seed.Parameters.AddWithValue("@through", throughInvoiceId);
                    seed.Parameters.AddWithValue("@observed", UtcNowText());
                    seed.ExecuteNonQuery();
                }

                int suppressed;
                using (var command = new SQLiteCommand(@"
update sale_outbox
set status='suppressed',
    next_attempt_at_utc=null,
    last_error='historical_overlap_baseline'
where source_key=@source
  and invoice_id <= @through
  and status in ('pending','failed')", _connection, transaction))
                {
                    command.Parameters.AddWithValue("@source", sourceKey);
                    command.Parameters.AddWithValue("@through", throughInvoiceId);
                    suppressed = command.ExecuteNonQuery();
                }

                transaction.Commit();
                return suppressed;
            }
        }
    }
}
