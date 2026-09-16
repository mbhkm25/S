using System;
using System.Collections.Generic;
using System.Data.SqlClient;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Web.Script.Serialization;

namespace Sanad.Bridge
{
    internal static class EdaaBaselineBuilder
    {
        private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue, RecursionLimit = 200 };

        public static EdaaBaselinePackage Build(EdaaDiscoveryResult discovery)
        {
            if (discovery == null) throw new ArgumentNullException(nameof(discovery));

            var baselineId = Guid.NewGuid().ToString();
            var capturedAt = DateTime.UtcNow;
            var expectedCounts = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            var manifestTables = new List<object>();
            var package = new EdaaBaselinePackage
            {
                BaselinePublicId = baselineId,
                SourceKey = discovery.SourceKey,
                SchemaFingerprint = discovery.SchemaFingerprint
            };

            using (var connection = new SqlConnection(discovery.CreateDatabaseConnectionString()))
            {
                connection.Open();
                foreach (var table in discovery.Tables.OrderBy(value => value.table_name, StringComparer.OrdinalIgnoreCase))
                {
                    var exportedColumns = table.columns.Where(IsExportableColumn).OrderBy(value => value.ordinal_position).ToList();
                    if (exportedColumns.Count == 0)
                        throw new EdaaDiscoveryException("edaa_master_table_no_exportable_columns", "No safe exportable columns were found in " + table.table_name + ".");

                    var rows = ReadRows(connection, table, exportedColumns);
                    if (rows.Count != table.row_count)
                        throw new EdaaDiscoveryException("edaa_baseline_count_changed", "Edaa master data changed while the baseline was being captured. Retry safely.");

                    expectedCounts[table.table_name] = rows.Count;
                    var tableHash = ComputeTableHash(table, exportedColumns, rows);
                    var schemaManifest = BuildTableManifest(table, exportedColumns);
                    manifestTables.Add(schemaManifest);

                    var payload = new Dictionary<string, object>
                    {
                        ["baseline_public_id"] = baselineId,
                        ["table_name"] = table.table_name,
                        ["schema"] = schemaManifest,
                        ["rows"] = rows
                    };
                    var integrity = new Dictionary<string, object>
                    {
                        ["baseline_public_id"] = baselineId,
                        ["schema_fingerprint"] = discovery.SchemaFingerprint,
                        ["row_count"] = rows.Count,
                        ["table_hash"] = tableHash,
                        ["snapshot_kind"] = "full_master_snapshot"
                    };
                    var eventId = "edaa-baseline:" + baselineId + ":" + table.table_name.ToLowerInvariant() + ":" + tableHash.Substring(0, 20);
                    var envelope = new Dictionary<string, object>
                    {
                        ["event_id"] = eventId,
                        ["adapter_code"] = "edaa_v5",
                        ["adapter_version"] = "v1",
                        ["event_schema_version"] = 1,
                        ["entity_type"] = "erp_master_snapshot",
                        ["source_record_id"] = table.table_name,
                        ["revision"] = tableHash,
                        ["captured_at"] = capturedAt.ToString("o", CultureInfo.InvariantCulture),
                        ["payload"] = payload,
                        ["integrity"] = integrity
                    };

                    package.Events.Add(new BaselineOutboxSeed
                    {
                        EventId = eventId,
                        BodyJson = Json.Serialize(envelope)
                    });
                }
            }

            var manifest = new Dictionary<string, object>
            {
                ["contract_version"] = 1,
                ["source_system"] = "edaa_v5",
                ["source_label"] = discovery.SourceLabel,
                ["source_version"] = discovery.SourceVersion,
                ["schema_fingerprint"] = discovery.SchemaFingerprint,
                ["captured_at"] = capturedAt.ToString("o", CultureInfo.InvariantCulture),
                ["tables"] = manifestTables,
                ["privacy"] = new Dictionary<string, object>
                {
                    ["mdf_path_uploaded"] = false,
                    ["sql_credentials_uploaded"] = false,
                    ["binary_columns_uploaded"] = false
                }
            };

            package.ManifestJson = Json.Serialize(manifest);
            package.ExpectedCountsJson = Json.Serialize(expectedCounts);
            return package;
        }

        private static List<Dictionary<string, object>> ReadRows(SqlConnection connection, EdaaTableSchema table, List<EdaaColumnSchema> exportedColumns)
        {
            var rows = new List<RowBuffer>();
            var select = string.Join(",", exportedColumns.Select(column => EdaaDiscoveryService.QuoteIdentifier(column.name)));
            var sql = "select " + select + " from " + EdaaDiscoveryService.QuoteIdentifier(table.table_name);

            using (var command = new SqlCommand(sql, connection))
            {
                command.CommandTimeout = 60;
                using (var reader = command.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        var row = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                        var canonical = new StringBuilder();
                        for (var index = 0; index < exportedColumns.Count; index++)
                        {
                            var column = exportedColumns[index];
                            var value = reader.IsDBNull(index) ? null : NormalizeValue(reader.GetValue(index));
                            row[column.name] = value;
                            AppendCanonical(canonical, column.name, value);
                        }
                        rows.Add(new RowBuffer { Data = row, Canonical = canonical.ToString() });
                    }
                }
            }

            rows.Sort((left, right) => string.CompareOrdinal(left.Canonical, right.Canonical));
            return rows.Select(value => value.Data).ToList();
        }

        private static object BuildTableManifest(EdaaTableSchema table, List<EdaaColumnSchema> exportedColumns)
        {
            var exported = new HashSet<string>(exportedColumns.Select(value => value.name), StringComparer.OrdinalIgnoreCase);
            var columns = table.columns.OrderBy(value => value.ordinal_position).Select(column => new Dictionary<string, object>
            {
                ["name"] = column.name,
                ["data_type"] = column.data_type,
                ["is_nullable"] = column.is_nullable,
                ["ordinal_position"] = column.ordinal_position,
                ["character_maximum_length"] = column.character_maximum_length,
                ["numeric_precision"] = column.numeric_precision,
                ["numeric_scale"] = column.numeric_scale,
                ["exported"] = exported.Contains(column.name),
                ["omission_reason"] = exported.Contains(column.name) ? null : GetOmissionReason(column)
            }).ToList();

            return new Dictionary<string, object>
            {
                ["table_name"] = table.table_name,
                ["row_count"] = table.row_count,
                ["primary_key"] = table.primary_key,
                ["columns"] = columns
            };
        }

        private static string ComputeTableHash(EdaaTableSchema table, List<EdaaColumnSchema> exportedColumns, List<Dictionary<string, object>> rows)
        {
            var canonical = new StringBuilder();
            canonical.Append(table.table_name.ToLowerInvariant()).Append('\n');
            foreach (var column in exportedColumns)
                canonical.Append(column.ordinal_position).Append(':').Append(column.name.ToLowerInvariant()).Append(':').Append((column.data_type ?? string.Empty).ToLowerInvariant()).Append('\n');

            var rowStrings = new List<string>();
            foreach (var row in rows)
            {
                var rowCanonical = new StringBuilder();
                foreach (var column in exportedColumns)
                {
                    object value;
                    row.TryGetValue(column.name, out value);
                    AppendCanonical(rowCanonical, column.name, value);
                }
                rowStrings.Add(rowCanonical.ToString());
            }
            rowStrings.Sort(StringComparer.Ordinal);
            foreach (var row in rowStrings) canonical.Append(row).Append('\n');
            return BridgeCrypto.Sha256Hex(canonical.ToString());
        }

        private static bool IsExportableColumn(EdaaColumnSchema column)
        {
            var type = (column.data_type ?? string.Empty).ToLowerInvariant();
            if (type == "binary" || type == "varbinary" || type == "image" || type == "timestamp" || type == "rowversion") return false;
            var name = (column.name ?? string.Empty).ToLowerInvariant();
            return !name.Contains("password") && !name.Contains("passwd") && !name.Contains("secret") && !name.Contains("credential") && !name.Contains("token");
        }

        private static string GetOmissionReason(EdaaColumnSchema column)
        {
            var type = (column.data_type ?? string.Empty).ToLowerInvariant();
            if (type == "binary" || type == "varbinary" || type == "image" || type == "timestamp" || type == "rowversion") return "binary_or_rowversion";
            return "sensitive_name_guard";
        }

        private static object NormalizeValue(object value)
        {
            if (value == null || value == DBNull.Value) return null;
            if (value is DateTime) return ((DateTime)value).ToString("yyyy-MM-ddTHH:mm:ss.fff", CultureInfo.InvariantCulture);
            if (value is Guid) return value.ToString();
            if (value is byte[]) return null;
            return value;
        }

        private static void AppendCanonical(StringBuilder builder, string name, object value)
        {
            var text = value == null ? "<null>" : Convert.ToString(value, CultureInfo.InvariantCulture) ?? string.Empty;
            builder.Append(name.Length).Append(':').Append(name).Append('=')
                .Append(text.Length).Append(':').Append(text).Append(';');
        }

        private sealed class RowBuffer
        {
            public Dictionary<string, object> Data { get; set; }
            public string Canonical { get; set; }
        }
    }
}
