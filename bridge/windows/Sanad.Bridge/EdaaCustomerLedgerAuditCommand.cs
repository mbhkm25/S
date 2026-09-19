using System;
using System.Data.SqlClient;
using System.Globalization;

namespace Sanad.Bridge
{
    internal static class EdaaCustomerLedgerAuditCommand
    {
        public static int Run(string[] args)
        {
            try
            {
                Console.WriteLine("SANAD Bridge Edaa customer-ledger audit");
                Console.WriteLine("Mode: READ-ONLY aggregate semantic evidence; no names, amounts, document numbers, or cloud upload");
                Console.WriteLine();

                var core = EdaaDiscoveryService.Discover();
                using (var connection = new SqlConnection(core.CreateDatabaseConnectionString()))
                {
                    connection.Open();

                    Console.WriteLine("=== CUSTOMER IDENTITY COVERAGE ===");
                    PrintScalar(connection, "distinct_sale_customer_names", @"
select count(*) from (
  select distinct ltrim(rtrim(isnull(CustomerName,''))) as CustomerName
  from tblSellInvoice
  where nullif(ltrim(rtrim(isnull(CustomerName,''))),'') is not null
) x");

                    PrintScalar(connection, "sale_names_matching_customer_master", @"
select count(*) from (
  select distinct ltrim(rtrim(isnull(s.CustomerName,''))) as CustomerName
  from tblSellInvoice s
  where nullif(ltrim(rtrim(isnull(s.CustomerName,''))),'') is not null
    and exists (
      select 1 from tblCustomersInfo c
      where ltrim(rtrim(isnull(c.CustomerName,''))) = ltrim(rtrim(isnull(s.CustomerName,'')))
    )
) x");

                    PrintScalar(connection, "sale_names_unique_account", @"
select count(*) from (
  select ltrim(rtrim(isnull(CustomerName,''))) as CustomerName
  from tblSellInvoice
  where nullif(ltrim(rtrim(isnull(CustomerName,''))),'') is not null
    and AccountID is not null
  group by ltrim(rtrim(isnull(CustomerName,'')))
  having count(distinct AccountID) = 1
) x");

                    PrintScalar(connection, "sale_names_multiple_accounts", @"
select count(*) from (
  select ltrim(rtrim(isnull(CustomerName,''))) as CustomerName
  from tblSellInvoice
  where nullif(ltrim(rtrim(isnull(CustomerName,''))),'') is not null
    and AccountID is not null
  group by ltrim(rtrim(isnull(CustomerName,'')))
  having count(distinct AccountID) > 1
) x");

                    PrintScalar(connection, "master_customers_with_sale_name", @"
select count(*)
from tblCustomersInfo c
where nullif(ltrim(rtrim(isnull(c.CustomerName,''))),'') is not null
  and exists (
    select 1 from tblSellInvoice s
    where ltrim(rtrim(isnull(s.CustomerName,''))) = ltrim(rtrim(isnull(c.CustomerName,'')))
  )");

                    PrintScalar(connection, "master_customers_unique_sale_account", @"
select count(*)
from tblCustomersInfo c
where nullif(ltrim(rtrim(isnull(c.CustomerName,''))),'') is not null
  and 1 = (
    select count(*) from (
      select distinct s.AccountID
      from tblSellInvoice s
      where s.AccountID is not null
        and ltrim(rtrim(isnull(s.CustomerName,''))) = ltrim(rtrim(isnull(c.CustomerName,'')))
    ) a
  )");

                    PrintScalar(connection, "master_customers_without_sale_name", @"
select count(*)
from tblCustomersInfo c
where nullif(ltrim(rtrim(isnull(c.CustomerName,''))),'') is not null
  and not exists (
    select 1 from tblSellInvoice s
    where ltrim(rtrim(isnull(s.CustomerName,''))) = ltrim(rtrim(isnull(c.CustomerName,'')))
  )");

                    Console.WriteLine();
                    Console.WriteLine("=== ENTRY SIGN EVIDENCE FOR MATCHED PARTY ACCOUNTS ===");

                    PrintSignCounts(connection, "sale_party_entry", @"
select d.Amount
from tblSellInvoice s
inner join tblEntriesDetails d on d.ParentID=s.EntryID and d.AccountID=s.AccountID
where s.EntryID is not null and s.AccountID is not null");

                    PrintSignCounts(connection, "sale_return_party_entry", @"
select d.Amount
from tblRedoneSellInvoice s
inner join tblEntriesDetails d on d.ParentID=s.EntryID and d.AccountID=s.AccountID
where s.EntryID is not null and s.AccountID is not null");

                    PrintSignCounts(connection, "receipt_party_entry", @"
select d.Amount
from tblMultiRecieving r
inner join tblMultiRecievingDetails rd on rd.ParentID=r.ID
inner join tblEntriesDetails d on d.ParentID=r.EntryID and d.AccountID=rd.ToAccountID
where r.EntryID is not null and rd.ToAccountID is not null");

                    PrintSignCounts(connection, "spending_party_entry", @"
select d.Amount
from tblMultiSpending s
inner join tblMultiSpendingDetails sd on sd.ParentID=s.ID
inner join tblEntriesDetails d on d.ParentID=s.EntryID and d.AccountID=sd.FromAccountID
where s.EntryID is not null and sd.FromAccountID is not null");

                    PrintSignCounts(connection, "simple_tie_from_entry", @"
select d.Amount
from tblSimpleTies t
inner join tblEntriesDetails d on d.ParentID=t.EntryID and d.AccountID=t.FromAccountID
where t.EntryID is not null and t.FromAccountID is not null");

                    PrintSignCounts(connection, "simple_tie_to_entry", @"
select d.Amount
from tblSimpleTies t
inner join tblEntriesDetails d on d.ParentID=t.EntryID and d.AccountID=t.ToAccountID
where t.EntryID is not null and t.ToAccountID is not null");

                    Console.WriteLine();
                    Console.WriteLine("=== ENTRY DOCUMENT TYPES ===");
                    using (var command = new SqlCommand(@"
select isnull(DocType,'(null)') as DocType, count(*) as C
from tblEntries
group by isnull(DocType,'(null)')
order by C desc, DocType", connection))
                    {
                        command.CommandTimeout = 120;
                        using (var reader = command.ExecuteReader())
                        {
                            while (reader.Read())
                            {
                                Console.WriteLine(
                                    Convert.ToString(reader["DocType"], CultureInfo.InvariantCulture) +
                                    " : " +
                                    Convert.ToString(reader["C"], CultureInfo.InvariantCulture)
                                );
                            }
                        }
                    }

                    Console.WriteLine();
                    Console.WriteLine("No customer names, phone numbers, document numbers, or monetary values were printed.");
                    Console.WriteLine("No writes were performed against Edaa or SANAD Cloud.");
                }

                return 0;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("Customer-ledger audit failed safely: " + ex.Message);
                return 1;
            }
        }

        private static void PrintScalar(SqlConnection connection, string label, string sql)
        {
            using (var command = new SqlCommand(sql, connection))
            {
                command.CommandTimeout = 120;
                var value = command.ExecuteScalar();
                Console.WriteLine(label.PadRight(42) + ": " + Convert.ToString(value, CultureInfo.InvariantCulture));
            }
        }

        private static void PrintSignCounts(SqlConnection connection, string label, string sourceSql)
        {
            var sql = @"
select
  count(*) as total_count,
  sum(case when Amount > 0 then 1 else 0 end) as positive_count,
  sum(case when Amount < 0 then 1 else 0 end) as negative_count,
  sum(case when Amount = 0 then 1 else 0 end) as zero_count
from (" + sourceSql + @") x";

            using (var command = new SqlCommand(sql, connection))
            {
                command.CommandTimeout = 120;
                using (var reader = command.ExecuteReader())
                {
                    if (!reader.Read()) return;
                    Console.WriteLine(
                        label.PadRight(28) +
                        " total=" + Convert.ToString(reader["total_count"], CultureInfo.InvariantCulture) +
                        " | positive=" + Convert.ToString(reader["positive_count"], CultureInfo.InvariantCulture) +
                        " | negative=" + Convert.ToString(reader["negative_count"], CultureInfo.InvariantCulture) +
                        " | zero=" + Convert.ToString(reader["zero_count"], CultureInfo.InvariantCulture)
                    );
                }
            }
        }
    }
}
