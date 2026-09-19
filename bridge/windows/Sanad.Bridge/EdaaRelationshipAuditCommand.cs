using System;
using System.Collections.Generic;
using System.Data.SqlClient;
using System.Globalization;

namespace Sanad.Bridge
{
    internal static class EdaaRelationshipAuditCommand
    {
        public static int Run(string[] args)
        {
            try
            {
                Console.WriteLine("SANAD Bridge Edaa relationship audit");
                Console.WriteLine("Mode: READ-ONLY aggregate relationship evidence; no row values; no cloud upload");
                Console.WriteLine();

                var core = EdaaDiscoveryService.Discover();
                using (var connection = new SqlConnection(core.CreateDatabaseConnectionString()))
                {
                    connection.Open();

                    PrintScalar(connection, "sales_total", "select count(*) from tblSellInvoice");
                    PrintScalar(connection, "sales_with_account", "select count(*) from tblSellInvoice where AccountID is not null");
                    PrintScalar(connection, "sales_account_join_match", @"
select count(*)
from tblSellInvoice s
inner join tblAccounts a on a.ID=s.AccountID");
                    PrintScalar(connection, "sales_account_name_exact_match", @"
select count(*)
from tblSellInvoice s
inner join tblAccounts a on a.ID=s.AccountID
where ltrim(rtrim(isnull(s.CustomerName,''))) = ltrim(rtrim(isnull(a.AccountName,'')))");
                    PrintScalar(connection, "sales_customer_master_name_match", @"
select count(*)
from tblSellInvoice s
where exists (
  select 1 from tblCustomersInfo c
  where ltrim(rtrim(isnull(c.CustomerName,''))) = ltrim(rtrim(isnull(s.CustomerName,'')))
)");
                    PrintScalar(connection, "sales_distinct_account_customer_pairs", @"
select count(*) from (
  select distinct AccountID, CustomerName
  from tblSellInvoice
  where AccountID is not null
) x");
                    PrintScalar(connection, "sales_account_ids_with_multiple_customer_names", @"
select count(*) from (
  select AccountID
  from tblSellInvoice
  where AccountID is not null
  group by AccountID
  having count(distinct ltrim(rtrim(isnull(CustomerName,'')))) > 1
) x");

                    PrintScalar(connection, "customer_master_total", "select count(*) from tblCustomersInfo");
                    PrintScalar(connection, "customer_name_to_account_name_exact", @"
select count(*)
from tblCustomersInfo c
where exists (
  select 1 from tblAccounts a
  where ltrim(rtrim(isnull(a.AccountName,''))) = ltrim(rtrim(isnull(c.CustomerName,'')))
)");
                    PrintScalar(connection, "customer_number_to_account_number_exact", @"
select count(*)
from tblCustomersInfo c
where nullif(ltrim(rtrim(isnull(c.CustomerNumber,''))),'') is not null
  and exists (
    select 1 from tblAccounts a
    where ltrim(rtrim(isnull(a.AccountNumber,''))) = ltrim(rtrim(isnull(c.CustomerNumber,'')))
  )");

                    PrintScalar(connection, "receipts_total", "select count(*) from tblMultiRecieving");
                    PrintScalar(connection, "receipt_details_total", "select count(*) from tblMultiRecievingDetails");
                    PrintScalar(connection, "receipt_details_parent_match", @"
select count(*)
from tblMultiRecievingDetails d
inner join tblMultiRecieving h on h.ID=d.ParentID");
                    PrintScalar(connection, "receipt_to_account_match", @"
select count(*)
from tblMultiRecievingDetails d
inner join tblAccounts a on a.ID=d.ToAccountID");
                    PrintScalar(connection, "receipts_entry_match", @"
select count(*)
from tblMultiRecieving r
inner join tblEntries e on e.ID=r.EntryID");

                    PrintScalar(connection, "spending_total", "select count(*) from tblMultiSpending");
                    PrintScalar(connection, "spending_details_total", "select count(*) from tblMultiSpendingDetails");
                    PrintScalar(connection, "spending_details_parent_match", @"
select count(*)
from tblMultiSpendingDetails d
inner join tblMultiSpending h on h.ID=d.ParentID");
                    PrintScalar(connection, "spending_from_account_match", @"
select count(*)
from tblMultiSpendingDetails d
inner join tblAccounts a on a.ID=d.FromAccountID");
                    PrintScalar(connection, "spending_entry_match", @"
select count(*)
from tblMultiSpending s
inner join tblEntries e on e.ID=s.EntryID");

                    PrintScalar(connection, "simple_ties_total", "select count(*) from tblSimpleTies");
                    PrintScalar(connection, "simple_ties_from_account_match", @"
select count(*)
from tblSimpleTies t
inner join tblAccounts a on a.ID=t.FromAccountID");
                    PrintScalar(connection, "simple_ties_to_account_match", @"
select count(*)
from tblSimpleTies t
inner join tblAccounts a on a.ID=t.ToAccountID");
                    PrintScalar(connection, "simple_ties_entry_match", @"
select count(*)
from tblSimpleTies t
inner join tblEntries e on e.ID=t.EntryID");

                    PrintScalar(connection, "sales_entry_match", @"
select count(*)
from tblSellInvoice s
inner join tblEntries e on e.ID=s.EntryID");
                    PrintScalar(connection, "sales_details_parent_match", @"
select count(*)
from tblSellInvoiceDetailes d
inner join tblSellInvoice s on s.ID=d.ParentID");
                    PrintScalar(connection, "entries_details_parent_match", @"
select count(*)
from tblEntriesDetails d
inner join tblEntries e on e.ID=d.ParentID");
                    PrintScalar(connection, "entries_details_account_match", @"
select count(*)
from tblEntriesDetails d
inner join tblAccounts a on a.ID=d.AccountID");

                    PrintScalar(connection, "sales_entry_contains_same_account", @"
select count(*)
from tblSellInvoice s
where s.EntryID is not null and s.AccountID is not null
  and exists (
    select 1 from tblEntriesDetails d
    where d.ParentID=s.EntryID and d.AccountID=s.AccountID
  )");

                    PrintScalar(connection, "receipt_entry_contains_to_account", @"
select count(*)
from tblMultiRecieving r
inner join tblMultiRecievingDetails rd on rd.ParentID=r.ID
where r.EntryID is not null and rd.ToAccountID is not null
  and exists (
    select 1 from tblEntriesDetails d
    where d.ParentID=r.EntryID and d.AccountID=rd.ToAccountID
  )");

                    PrintScalar(connection, "spending_entry_contains_from_account", @"
select count(*)
from tblMultiSpending s
inner join tblMultiSpendingDetails sd on sd.ParentID=s.ID
where s.EntryID is not null and sd.FromAccountID is not null
  and exists (
    select 1 from tblEntriesDetails d
    where d.ParentID=s.EntryID and d.AccountID=sd.FromAccountID
  )");

                    Console.WriteLine();
                    Console.WriteLine("No customer names, phone numbers, document numbers, amounts, or row values were printed.");
                    Console.WriteLine("No writes were performed against Edaa or SANAD Cloud.");
                }

                return 0;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("Relationship audit failed safely: " + ex.Message);
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
    }
}
