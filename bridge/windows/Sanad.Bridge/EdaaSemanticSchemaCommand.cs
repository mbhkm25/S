using System;
using System.Collections.Generic;
using System.Linq;

namespace Sanad.Bridge
{
    internal static class EdaaSemanticSchemaCommand
    {
        private static readonly string[] DefaultTables = new[]
        {
            "tblAccounts",
            "tblCustomersInfo",
            "tblSuppliersInfo",
            "tblSellInvoice",
            "tblSellInvoiceDetailes",
            "tblRedoneSellInvoice",
            "tblRedoneSellInvoiceDetailes",
            "tblBuyInvoice",
            "tblBuyInvoiceDetailes",
            "tblEntries",
            "tblEntriesDetails",
            "tblMultiRecieving",
            "tblMultiRecievingDetails",
            "tblMultiSpending",
            "tblMultiSpendingDetails",
            "tblSimpleTies",
            "tblCurrencies",
            "tblClasses",
            "tblUnits",
            "tblBackupCopies"
        };

        public static int Run(string[] args)
        {
            try
            {
                Console.WriteLine("SANAD Bridge Edaa semantic schema discovery");
                Console.WriteLine("Mode: READ-ONLY metadata only; no row values; no cloud upload");
                Console.WriteLine();

                var core = EdaaDiscoveryService.Discover();
                var full = EdaaLogicalSnapshotDiscovery.Discover(core);

                Console.WriteLine("Edaa database           : " + core.DatabaseName);
                Console.WriteLine("Full schema fingerprint : " + full.FullSchemaFingerprint);
                Console.WriteLine();

                var selected = full.Tables
                    .Where(t => DefaultTables.Contains(t.table_name, StringComparer.OrdinalIgnoreCase))
                    .OrderBy(t => t.table_name, StringComparer.OrdinalIgnoreCase)
                    .ToList();

                foreach (var table in selected)
                {
                    Console.WriteLine("=== " + table.table_name + " ===");
                    Console.WriteLine("rows=" + table.row_count + " | pk=" +
                        (table.primary_key != null && table.primary_key.Count > 0
                            ? string.Join(",", table.primary_key)
                            : "(none)"));

                    foreach (var column in table.columns.OrderBy(c => c.ordinal_position))
                    {
                        Console.WriteLine(
                            column.ordinal_position + ". " + column.name +
                            " | " + column.data_type +
                            " | nullable=" + column.is_nullable +
                            " | len=" + (column.character_maximum_length.HasValue ? column.character_maximum_length.Value.ToString() : "-") +
                            " | precision=" + (column.numeric_precision.HasValue ? column.numeric_precision.Value.ToString() : "-") +
                            " | scale=" + (column.numeric_scale.HasValue ? column.numeric_scale.Value.ToString() : "-")
                        );
                    }
                    Console.WriteLine();
                }

                Console.WriteLine("=== CANDIDATE SHARED KEY NAMES ===");
                var candidates = selected
                    .SelectMany(t => t.columns.Select(c => new { Table = t.table_name, Column = c.name }))
                    .GroupBy(x => x.Column, StringComparer.OrdinalIgnoreCase)
                    .Where(g => g.Count() >= 2)
                    .OrderByDescending(g => g.Count())
                    .ThenBy(g => g.Key, StringComparer.OrdinalIgnoreCase);

                foreach (var candidate in candidates)
                {
                    Console.WriteLine(candidate.Key + " -> " + string.Join(", ", candidate.Select(x => x.Table).Distinct(StringComparer.OrdinalIgnoreCase)));
                }

                Console.WriteLine();
                Console.WriteLine("No row values were printed.");
                Console.WriteLine("No writes were performed against Edaa or SANAD Cloud.");
                return 0;
            }
            catch (EdaaDiscoveryException ex)
            {
                Console.Error.WriteLine("Semantic schema discovery stopped safely: " + ex.Code);
                Console.Error.WriteLine(ex.Message);
                return 8;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("Semantic schema discovery failed safely: " + ex.Message);
                return 1;
            }
        }
    }
}
