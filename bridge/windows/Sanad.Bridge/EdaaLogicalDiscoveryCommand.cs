using System;
using System.Linq;

namespace Sanad.Bridge
{
    internal static class EdaaLogicalDiscoveryCommand
    {
        public static int Run(string[] args)
        {
            try
            {
                Console.WriteLine("SANAD Bridge Edaa logical discovery");
                Console.WriteLine("Mode: READ-ONLY schema + row-count inventory; no cloud upload");
                Console.WriteLine();

                var core = EdaaDiscoveryService.Discover();
                var full = EdaaLogicalSnapshotDiscovery.Discover(core);

                Console.WriteLine("Edaa database            : " + core.DatabaseName);
                Console.WriteLine("Source key               : " + core.SourceKey);
                Console.WriteLine("Core schema fingerprint  : " + core.SchemaFingerprint);
                Console.WriteLine("Full schema fingerprint  : " + full.FullSchemaFingerprint);
                Console.WriteLine("User tables discovered   : " + full.Tables.Count);
                Console.WriteLine();

                long totalRows = 0;
                foreach (var table in full.Tables.OrderBy(t => t.table_name, StringComparer.OrdinalIgnoreCase))
                {
                    totalRows += table.row_count;
                    var exportable = table.columns.Count(IsExportableColumn);
                    var omitted = table.columns.Count - exportable;
                    var pk = table.primary_key != null && table.primary_key.Count > 0
                        ? string.Join(",", table.primary_key)
                        : "(none)";

                    Console.WriteLine(
                        table.table_name +
                        " | rows=" + table.row_count +
                        " | columns=" + table.columns.Count +
                        " | exportable=" + exportable +
                        " | omitted=" + omitted +
                        " | pk=" + pk
                    );
                }

                Console.WriteLine();
                Console.WriteLine("Total rows observed      : " + totalRows);
                Console.WriteLine("No row values were printed.");
                Console.WriteLine("No writes were performed against Edaa or SANAD Cloud.");
                return 0;
            }
            catch (EdaaDiscoveryException ex)
            {
                Console.Error.WriteLine("Discovery stopped safely: " + ex.Code);
                Console.Error.WriteLine(ex.Message);
                return 8;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("Discovery failed safely: " + ex.Message);
                return 1;
            }
        }

        private static bool IsExportableColumn(EdaaColumnSchema column)
        {
            var type = (column.data_type ?? string.Empty).ToLowerInvariant();
            if (type == "binary" || type == "varbinary" || type == "image" || type == "timestamp" || type == "rowversion")
                return false;

            var name = (column.name ?? string.Empty).ToLowerInvariant();
            return !name.Contains("password")
                && !name.Contains("passwd")
                && !name.Contains("secret")
                && !name.Contains("credential")
                && !name.Contains("token");
        }
    }
}
