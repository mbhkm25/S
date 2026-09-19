using System;
using System.Collections.Generic;
using System.Data.SqlClient;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Web.Script.Serialization;

namespace Sanad.Bridge
{
    internal static class EdaaLogicalSnapshotBuilder
    {
        private const int ChunkSize = 200;
        private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue, RecursionLimit = 300 };

        public static EdaaBaselinePackage Build(EdaaDiscoveryResult core, EdaaLogicalSnapshotSchema full)
        {
            if (core == null) throw new ArgumentNullException(nameof(core));
            if (full == null) throw new ArgumentNullException(nameof(full));

            var snapshotId = Guid.NewGuid().ToString();
            var capturedAt = DateTime.UtcNow;
            var expectedCounts = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            var manifestTables = new List<object>();
            var package = new EdaaBaselinePackage
            {
                BaselinePublicId = snapshotId,
                SourceKey = core.SourceKey,
                // Cloud compatibility is still guarded by the already-authorized/core fingerprint.
                SchemaFingerprint = core.SchemaFingerprint
            };

            using (var connection = new SqlConnection(core.CreateDatabaseConnectionString()))
            {
                connection.Open();

                foreach (var table in full.Tables.OrderBy(t => t.table_name, StringComparer.OrdinalIgnoreCase))
                {
                    var exportedColumns = table.columns
                        .Where(IsExportableColumn)
                        .OrderBy(c => c.ordinal_position)
                        .ToList();

                    if (exportedColumns.Count == 0)
                    {
                        manifestTables.Add(BuildTableManifest(table, exportedColumns));
                        expectedCounts[table.table_name] = 0;
                        AddChunk(package, snapshotId, core, full, table, exportedColumns, new List<Dictionary<string, object>>(), 0, 1, capturedAt);
                        continue;
                    }

                    var rows = ReadRows(connection, table, exportedColumns);
                    if (rows.Count != table.row_count)
                        throw new EdaaDiscoveryException("edaa_logical_snapshot_count_changed", "Edaa data changed while table " + table.table_name + " was being captured. Retry the logical snapshot safely.");

                    expectedCounts[table.table_name] = rows.Count;
                    manifestTables.Add(BuildTableManifest(table, exportedColumns));

                    var totalChunks = Math.Max(1, (int)Math.Ceiling(rows.Count / (double)ChunkSize));
                    for (var chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++)
                    {
                        var chunkRows = rows.Skip(chunkIndex * ChunkSize).Take(ChunkSize).ToList();
                        AddChunk(package, snapshotId, core, full, table, exportedColumns, chunkRows, chunkIndex, totalChunks, capturedAt);
                    }
                }
            }

            var manifest = new Dictionary<string, object>
            {
                ["contract_version"] = 1,
                ["snapshot_kind"] = "logical_full",
                ["source_system"] = "edaa_v5",
                ["source_label"] = core.SourceLabel,
                ["source_version"] = core.SourceVersion,
                ["core_schema_fingerprint"] = core.SchemaFingerprint,
                ["full_schema_fingerprint"] = full.FullSchemaFingerprint,
                ["captured_at"] = capturedAt.ToString("o", CultureInfo.InvariantCulture),
                ["table_count"] = full.Tables.Count,
                ["tables"] = manifestTables,
                ["coverage"] = new Dictionary<string, object>
                {
                    ["structured_columns"] = "all_safe_exportable",
                    ["binary_columns"] = "omitted_v1",
                    ["credential_like_columns"] = "omitted_v1"
                },
                ["disaster_recovery"] = new Dictionary<string, object>
                {
                    ["physical_sql_backup"] = false,
                    ["restorable_bak"] = false,
                    ["description"] = "Logical cloud snapshot for remote access and recovery of structured ERP data; not a SQL Server .bak image."
                }
            };

            package.ManifestJson = Json.Serialize(manifest);
            package.ExpectedCountsJson = Json.Serialize(expectedCounts);
            return package;
        }

        private static List<Dictionary<string, object>> ReadRows(SqlConnection connection, EdaaTableSchema table, List<EdaaColumnSchema> columns)
        {
            var rows = new List<Dictionary<string, object>>();
            var select = string.Join(",", columns.Select(c => EdaaDiscoveryService.QuoteIdentifier(c.name)));
            var sql = "select " + select + " from " + EdaaDiscoveryService.QuoteIdentifier(table.table_name);

            using (var command = new SqlCommand(sql, connection))
            {
                command.CommandTimeout = 120;
                using (var reader = command.ExecuteReader())
                {
                    long sequence = 0;
                    while (reader.Read())
                    {
                        sequence++;
                        var data = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                        for (var i = 0; i < columns.Count; i++)
                        {
                            var value = reader.IsDBNull(i) ? null : NormalizeValue(reader.GetValue(i));
                            data[columns[i].name] = value;
                        }

                        var rowCanonical = Canonicalize(columns, data);
                        var rowHash = BridgeCrypto.Sha256Hex(rowCanonical);
                        var rowKey = BuildRowKey(table, data, rowHash, sequence);

                        rows.Add(new Dictionary<string, object>
                        {
                            ["row_key"] = rowKey,
                            ["row_hash"] = rowHash,
                            ["data"] = data
                        });
                    }
                }
            }
            return rows;
        }

        private static string BuildRowKey(EdaaTableSchema table, Dictionary<string, object> data, string rowHash, long sequence)
        {
            if (table.primary_key != null && table.primary_key.Count > 0)
            {
                var canonical = new StringBuilder();
                foreach (var name in table.primary_key)
                {
                    object value;
                    data.TryGetValue(name, out value);
                    AppendCanonical(canonical, name, value);
                }
                return "pk:" + BridgeCrypto.Sha256Hex(canonical.ToString());
            }

            // Snapshot-local sequence preserves duplicate legacy rows when no primary key exists.
            return "row:" + sequence.ToString(CultureInfo.InvariantCulture) + ":" + rowHash.Substring(0, 20);
        }

        private static void AddChunk(
            EdaaBaselinePackage package,
            string snapshotId,
            EdaaDiscoveryResult core,
            EdaaLogicalSnapshotSchema full,
            EdaaTableSchema table,
            List<EdaaColumnSchema> columns,
            List<Dictionary<string, object>> rows,
            int chunkIndex,
            int totalChunks,
            DateTime capturedAt)
        {
            var payload = new Dictionary<string, object>
            {
                ["snapshot_public_id"] = snapshotId,
                ["snapshot_kind"] = "logical_full",
                ["table_name"] = table.table_name,
                ["chunk_index"] = chunkIndex,
                ["total_chunks"] = totalChunks,
                ["primary_key"] = table.primary_key,
                ["rows"] = rows
            };

            var chunkHash = BridgeCrypto.Sha256Hex(Json.Serialize(rows));
            var integrity = new Dictionary<string, object>
            {
                ["baseline_public_id"] = snapshotId,
                ["schema_fingerprint"] = core.SchemaFingerprint,
                ["full_schema_fingerprint"] = full.FullSchemaFingerprint,
                ["table_name"] = table.table_name,
                ["row_count"] = rows.Count,
                ["chunk_index"] = chunkIndex,
                ["total_chunks"] = totalChunks,
                ["chunk_hash"] = chunkHash,
                ["snapshot_kind"] = "logical_full"
            };

            var sourceRecordId = table.table_name + ":" + chunkIndex.ToString(CultureInfo.InvariantCulture);
            var eventId = "edaa-logical:" + snapshotId + ":" + table.table_name.ToLowerInvariant() + ":" + chunkIndex.ToString(CultureInfo.InvariantCulture) + ":" + chunkHash.Substring(0, 16);
            var envelope = new Dictionary<string, object>
            {
                ["event_id"] = eventId,
                ["adapter_code"] = "edaa_v5",
                ["adapter_version"] = "v1",
                ["event_schema_version"] = 1,
                ["entity_type"] = "erp_logical_snapshot_chunk",
                ["source_record_id"] = sourceRecordId,
                ["revision"] = chunkHash,
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

        private static object BuildTableManifest(EdaaTableSchema table, List<EdaaColumnSchema> exportedColumns)
        {
            var exported = new HashSet<string>(exportedColumns.Select(c => c.name), StringComparer.OrdinalIgnoreCase);
            return new Dictionary<string, object>
            {
                ["table_name"] = table.table_name,
                ["row_count"] = table.row_count,
                ["primary_key"] = table.primary_key,
                ["columns"] = table.columns.OrderBy(c => c.ordinal_position).Select(c => new Dictionary<string, object>
                {
                    ["name"] = c.name,
                    ["data_type"] = c.data_type,
                    ["is_nullable"] = c.is_nullable,
                    ["ordinal_position"] = c.ordinal_position,
                    ["exported"] = exported.Contains(c.name),
                    ["omission_reason"] = exported.Contains(c.name) ? null : GetOmissionReason(c)
                }).ToList()
            };
        }

        private static bool IsExportableColumn(EdaaColumnSchema column)
        {
            var type = (column.data_type ?? "").ToLowerInvariant();
            if (type == "binary" || type == "varbinary" || type == "image" || type == "timestamp" || type == "rowversion") return false;
            var name = (column.name ?? "").ToLowerInvariant();
            return !name.Contains("password")
                && !name.Contains("passwd")
                && !name.Contains("secret")
                && !name.Contains("credential")
                && !name.Contains("token");
        }

        private static string GetOmissionReason(EdaaColumnSchema column)
        {
            var type = (column.data_type ?? "").ToLowerInvariant();
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

        private static string Canonicalize(List<EdaaColumnSchema> columns, Dictionary<string, object> data)
        {
            var builder = new StringBuilder();
            foreach (var column in columns)
            {
                object value;
                data.TryGetValue(column.name, out value);
                AppendCanonical(builder, column.name, value);
            }
            return builder.ToString();
        }

        private static void AppendCanonical(StringBuilder builder, string name, object value)
        {
            var text = value == null ? "<null>" : Convert.ToString(value, CultureInfo.InvariantCulture) ?? "";
            builder.Append(name.Length).Append(':').Append(name).Append('=')
                .Append(text.Length).Append(':').Append(text).Append(';');
        }
    }
}
