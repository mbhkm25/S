using System;
using System.Collections.Generic;
using System.Data.SqlClient;
using System.Globalization;
using System.Linq;
using System.Text;

namespace Sanad.Bridge
{
    internal sealed class EdaaLogicalSnapshotSchema
    {
        public string FullSchemaFingerprint { get; set; }
        public List<EdaaTableSchema> Tables { get; set; } = new List<EdaaTableSchema>();
    }

    internal static class EdaaLogicalSnapshotDiscovery
    {
        public static EdaaLogicalSnapshotSchema Discover(EdaaDiscoveryResult core)
        {
            if (core == null) throw new ArgumentNullException(nameof(core));

            using (var connection = new SqlConnection(core.CreateDatabaseConnectionString()))
            {
                connection.Open();
                var tables = ReadAllUserTables(connection);
                PopulatePrimaryKeys(connection, tables);
                PopulateRowCounts(connection, tables);
                return new EdaaLogicalSnapshotSchema
                {
                    Tables = tables.OrderBy(t => t.table_name, StringComparer.OrdinalIgnoreCase).ToList(),
                    FullSchemaFingerprint = ComputeFingerprint(tables)
                };
            }
        }

        private static List<EdaaTableSchema> ReadAllUserTables(SqlConnection connection)
        {
            var map = new Dictionary<string, EdaaTableSchema>(StringComparer.OrdinalIgnoreCase);
            const string sql = @"
select c.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE, c.IS_NULLABLE, c.ORDINAL_POSITION,
       c.CHARACTER_MAXIMUM_LENGTH, c.NUMERIC_PRECISION, c.NUMERIC_SCALE
from INFORMATION_SCHEMA.COLUMNS c
inner join INFORMATION_SCHEMA.TABLES t on t.TABLE_NAME = c.TABLE_NAME
where t.TABLE_TYPE = 'BASE TABLE'
order by c.TABLE_NAME, c.ORDINAL_POSITION";

            using (var command = new SqlCommand(sql, connection))
            using (var reader = command.ExecuteReader())
            {
                while (reader.Read())
                {
                    var tableName = Convert.ToString(reader["TABLE_NAME"], CultureInfo.InvariantCulture);
                    if (!IsUserTable(tableName)) continue;

                    EdaaTableSchema table;
                    if (!map.TryGetValue(tableName, out table))
                    {
                        table = new EdaaTableSchema { table_name = tableName };
                        map[tableName] = table;
                    }

                    table.columns.Add(new EdaaColumnSchema
                    {
                        name = Convert.ToString(reader["COLUMN_NAME"], CultureInfo.InvariantCulture),
                        data_type = Convert.ToString(reader["DATA_TYPE"], CultureInfo.InvariantCulture),
                        is_nullable = Convert.ToString(reader["IS_NULLABLE"], CultureInfo.InvariantCulture),
                        ordinal_position = Convert.ToInt32(reader["ORDINAL_POSITION"], CultureInfo.InvariantCulture),
                        character_maximum_length = NullableInt(reader["CHARACTER_MAXIMUM_LENGTH"]),
                        numeric_precision = NullableInt(reader["NUMERIC_PRECISION"]),
                        numeric_scale = NullableInt(reader["NUMERIC_SCALE"])
                    });
                }
            }
            return map.Values.ToList();
        }

        private static bool IsUserTable(string name)
        {
            if (string.IsNullOrWhiteSpace(name)) return false;
            if (string.Equals(name, "dtproperties", StringComparison.OrdinalIgnoreCase)) return false;
            if (name.StartsWith("sys", StringComparison.OrdinalIgnoreCase)) return false;
            if (name.StartsWith("MSrep_", StringComparison.OrdinalIgnoreCase)) return false;
            return true;
        }

        private static void PopulatePrimaryKeys(SqlConnection connection, List<EdaaTableSchema> tables)
        {
            var map = tables.ToDictionary(t => t.table_name, StringComparer.OrdinalIgnoreCase);
            const string sql = @"
select ku.TABLE_NAME, ku.COLUMN_NAME, ku.ORDINAL_POSITION
from INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
inner join INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
  on tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
 and tc.TABLE_NAME = ku.TABLE_NAME
where tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
order by ku.TABLE_NAME, ku.ORDINAL_POSITION";

            using (var command = new SqlCommand(sql, connection))
            using (var reader = command.ExecuteReader())
            {
                while (reader.Read())
                {
                    EdaaTableSchema table;
                    var tableName = Convert.ToString(reader["TABLE_NAME"], CultureInfo.InvariantCulture);
                    if (map.TryGetValue(tableName, out table))
                        table.primary_key.Add(Convert.ToString(reader["COLUMN_NAME"], CultureInfo.InvariantCulture));
                }
            }
        }

        private static void PopulateRowCounts(SqlConnection connection, List<EdaaTableSchema> tables)
        {
            foreach (var table in tables)
            {
                using (var command = new SqlCommand("select count(*) from " + EdaaDiscoveryService.QuoteIdentifier(table.table_name), connection))
                {
                    command.CommandTimeout = 60;
                    table.row_count = Convert.ToInt32(command.ExecuteScalar(), CultureInfo.InvariantCulture);
                }
            }
        }

        private static string ComputeFingerprint(IEnumerable<EdaaTableSchema> tables)
        {
            var canonical = new StringBuilder();
            foreach (var table in tables.OrderBy(t => t.table_name, StringComparer.OrdinalIgnoreCase))
            {
                canonical.Append(table.table_name.ToLowerInvariant()).Append('|');
                foreach (var column in table.columns.OrderBy(c => c.ordinal_position))
                {
                    canonical.Append(column.ordinal_position).Append(':')
                        .Append((column.name ?? "").ToLowerInvariant()).Append(':')
                        .Append((column.data_type ?? "").ToLowerInvariant()).Append(':')
                        .Append(column.is_nullable ?? "").Append(':')
                        .Append(column.character_maximum_length.HasValue ? column.character_maximum_length.Value.ToString(CultureInfo.InvariantCulture) : "-").Append(':')
                        .Append(column.numeric_precision.HasValue ? column.numeric_precision.Value.ToString(CultureInfo.InvariantCulture) : "-").Append(':')
                        .Append(column.numeric_scale.HasValue ? column.numeric_scale.Value.ToString(CultureInfo.InvariantCulture) : "-").Append(';');
                }
                canonical.Append("pk=").Append(string.Join(",", table.primary_key.Select(v => (v ?? "").ToLowerInvariant()))).Append('\n');
            }
            return BridgeCrypto.Sha256Hex(canonical.ToString());
        }

        private static int? NullableInt(object value)
        {
            return value == null || value == DBNull.Value ? (int?)null : Convert.ToInt32(value, CultureInfo.InvariantCulture);
        }
    }
}
