using Microsoft.Win32;
using System;
using System.Collections.Generic;
using System.Data.SqlClient;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;

namespace Sanad.Bridge
{
    internal sealed class EdaaColumnSchema
    {
        public string name { get; set; }
        public string data_type { get; set; }
        public string is_nullable { get; set; }
        public int ordinal_position { get; set; }
        public int? character_maximum_length { get; set; }
        public int? numeric_precision { get; set; }
        public int? numeric_scale { get; set; }
    }

    internal sealed class EdaaTableSchema
    {
        public string table_name { get; set; }
        public List<EdaaColumnSchema> columns { get; set; } = new List<EdaaColumnSchema>();
        public List<string> primary_key { get; set; } = new List<string>();
        public int row_count { get; set; }
    }

    internal sealed class EdaaDiscoveryResult
    {
        public string DatabaseName { get; set; }
        public string MdfPath { get; set; }
        public string SourceKey { get; set; }
        public string SourceLabel { get; set; }
        public string SourceVersion { get; set; }
        public string SchemaFingerprint { get; set; }
        public List<EdaaTableSchema> Tables { get; set; } = new List<EdaaTableSchema>();

        public string CreateDatabaseConnectionString()
        {
            var builder = new SqlConnectionStringBuilder
            {
                DataSource = ".",
                InitialCatalog = DatabaseName,
                IntegratedSecurity = true,
                ConnectTimeout = 8,
                ApplicationName = "SANAD Bridge"
            };
            return builder.ConnectionString;
        }
    }

    internal sealed class EdaaDiscoveryException : Exception
    {
        public string Code { get; private set; }

        public EdaaDiscoveryException(string code, string message = null, Exception inner = null)
            : base(message ?? code, inner)
        {
            Code = code;
        }
    }

    internal static class EdaaDiscoveryService
    {
        private const string RegistryPath = @"Software\VB and VBA Program Settings\prjAccountsContinuous12\File";
        private const string RegistryValue = "DefultDataBase";

        private static readonly string[] RequiredTables =
        {
            "tblCurrencies",
            "tblCustomersInfo",
            "tblClasses",
            "tblUnits"
        };

        public static EdaaDiscoveryResult Discover()
        {
            var mdfPath = ReadActiveDatabasePath();
            if (!File.Exists(mdfPath))
                throw new EdaaDiscoveryException("edaa_mdf_not_found", "The Edaa database file referenced by DefultDataBase was not found.");

            try
            {
                using (var master = new SqlConnection(CreateMasterConnectionString()))
                {
                    master.Open();
                    var databaseName = ResolveDatabaseName(master, mdfPath);
                    if (string.IsNullOrWhiteSpace(databaseName))
                        throw new EdaaDiscoveryException("edaa_database_not_attached", "The active Edaa MDF is not attached to the local SQL Server instance.");

                    var serverVersion = ReadServerVersion(master);
                    using (var database = new SqlConnection(CreateDatabaseConnectionString(databaseName)))
                    {
                        database.Open();
                        var tables = ReadRequiredSchema(database);
                        var missing = RequiredTables.Where(name => tables.All(table => !string.Equals(table.table_name, name, StringComparison.OrdinalIgnoreCase))).ToArray();
                        if (missing.Length > 0)
                            throw new EdaaDiscoveryException("edaa_schema_incompatible", "Required Edaa tables are missing: " + string.Join(", ", missing));

                        PopulatePrimaryKeys(database, tables);
                        PopulateRowCounts(database, tables);

                        var schemaFingerprint = ComputeSchemaFingerprint(tables);
                        var sourceSeed = Environment.MachineName + "\n" + databaseName + "\n" + NormalizePath(mdfPath);
                        var sourceHash = BridgeCrypto.Sha256Hex(sourceSeed);

                        return new EdaaDiscoveryResult
                        {
                            DatabaseName = databaseName,
                            MdfPath = mdfPath,
                            SourceKey = "edaa_v5:" + sourceHash.Substring(0, 40),
                            SourceLabel = "إبداع سوفت — " + databaseName,
                            SourceVersion = serverVersion,
                            SchemaFingerprint = schemaFingerprint,
                            Tables = tables.OrderBy(table => table.table_name, StringComparer.OrdinalIgnoreCase).ToList()
                        };
                    }
                }
            }
            catch (EdaaDiscoveryException)
            {
                throw;
            }
            catch (SqlException ex)
            {
                throw new EdaaDiscoveryException("edaa_sql_unavailable", "Could not connect read-only to the local Edaa SQL Server.", ex);
            }
            catch (Exception ex)
            {
                throw new EdaaDiscoveryException("edaa_discovery_failed", "Edaa discovery failed safely.", ex);
            }
        }

        private static string ReadActiveDatabasePath()
        {
            using (var key = Registry.CurrentUser.OpenSubKey(RegistryPath, false))
            {
                var value = key == null ? null : key.GetValue(RegistryValue);
                var path = Convert.ToString(value, CultureInfo.InvariantCulture);
                if (string.IsNullOrWhiteSpace(path))
                    throw new EdaaDiscoveryException("edaa_registry_not_found", "Edaa DefultDataBase was not found in the current-user Registry.");
                return path.Trim();
            }
        }

        private static string CreateMasterConnectionString()
        {
            var builder = new SqlConnectionStringBuilder
            {
                DataSource = ".",
                InitialCatalog = "master",
                IntegratedSecurity = true,
                ConnectTimeout = 8,
                ApplicationName = "SANAD Bridge Discovery"
            };
            return builder.ConnectionString;
        }

        private static string CreateDatabaseConnectionString(string databaseName)
        {
            var builder = new SqlConnectionStringBuilder
            {
                DataSource = ".",
                InitialCatalog = databaseName,
                IntegratedSecurity = true,
                ConnectTimeout = 8,
                ApplicationName = "SANAD Bridge"
            };
            return builder.ConnectionString;
        }

        private static string ResolveDatabaseName(SqlConnection master, string mdfPath)
        {
            const string sql = @"
select d.name, f.filename
from master..sysdatabases d
inner join master..sysaltfiles f on d.dbid = f.dbid
where f.fileid = 1
order by d.name";

            using (var command = new SqlCommand(sql, master))
            using (var reader = command.ExecuteReader())
            {
                var expected = NormalizePath(mdfPath);
                while (reader.Read())
                {
                    var file = reader.IsDBNull(1) ? null : reader.GetString(1);
                    if (!string.IsNullOrWhiteSpace(file) && string.Equals(NormalizePath(file), expected, StringComparison.OrdinalIgnoreCase))
                        return reader.GetString(0);
                }
            }
            return null;
        }

        private static string ReadServerVersion(SqlConnection master)
        {
            using (var command = new SqlCommand("select @@version", master))
            {
                var value = Convert.ToString(command.ExecuteScalar(), CultureInfo.InvariantCulture) ?? string.Empty;
                value = value.Replace("\r", " ").Replace("\n", " ").Trim();
                return value.Length <= 240 ? value : value.Substring(0, 240);
            }
        }

        private static List<EdaaTableSchema> ReadRequiredSchema(SqlConnection database)
        {
            var map = RequiredTables.ToDictionary(name => name, name => new EdaaTableSchema { table_name = name }, StringComparer.OrdinalIgnoreCase);
            const string sql = @"
select TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE, ORDINAL_POSITION,
       CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE
from INFORMATION_SCHEMA.COLUMNS
order by TABLE_NAME, ORDINAL_POSITION";

            using (var command = new SqlCommand(sql, database))
            using (var reader = command.ExecuteReader())
            {
                while (reader.Read())
                {
                    var tableName = Convert.ToString(reader["TABLE_NAME"], CultureInfo.InvariantCulture);
                    EdaaTableSchema table;
                    if (!map.TryGetValue(tableName, out table)) continue;

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

            return map.Values.Where(table => table.columns.Count > 0).ToList();
        }

        private static void PopulatePrimaryKeys(SqlConnection database, List<EdaaTableSchema> tables)
        {
            var map = tables.ToDictionary(table => table.table_name, StringComparer.OrdinalIgnoreCase);
            const string sql = @"
select ku.TABLE_NAME, ku.COLUMN_NAME, ku.ORDINAL_POSITION
from INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
inner join INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
  on tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
 and tc.TABLE_NAME = ku.TABLE_NAME
where tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
order by ku.TABLE_NAME, ku.ORDINAL_POSITION";

            using (var command = new SqlCommand(sql, database))
            using (var reader = command.ExecuteReader())
            {
                while (reader.Read())
                {
                    var tableName = Convert.ToString(reader["TABLE_NAME"], CultureInfo.InvariantCulture);
                    EdaaTableSchema table;
                    if (map.TryGetValue(tableName, out table))
                        table.primary_key.Add(Convert.ToString(reader["COLUMN_NAME"], CultureInfo.InvariantCulture));
                }
            }
        }

        private static void PopulateRowCounts(SqlConnection database, List<EdaaTableSchema> tables)
        {
            foreach (var table in tables)
            {
                using (var command = new SqlCommand("select count(*) from " + QuoteIdentifier(table.table_name), database))
                {
                    command.CommandTimeout = 30;
                    table.row_count = Convert.ToInt32(command.ExecuteScalar(), CultureInfo.InvariantCulture);
                }
            }
        }

        private static string ComputeSchemaFingerprint(IEnumerable<EdaaTableSchema> tables)
        {
            var canonical = new StringBuilder();
            foreach (var table in tables.OrderBy(value => value.table_name, StringComparer.OrdinalIgnoreCase))
            {
                canonical.Append(table.table_name.ToLowerInvariant()).Append('|');
                foreach (var column in table.columns.OrderBy(value => value.ordinal_position))
                {
                    canonical.Append(column.ordinal_position).Append(':')
                        .Append(column.name.ToLowerInvariant()).Append(':')
                        .Append((column.data_type ?? string.Empty).ToLowerInvariant()).Append(':')
                        .Append(column.is_nullable ?? string.Empty).Append(':')
                        .Append(column.character_maximum_length.HasValue ? column.character_maximum_length.Value.ToString(CultureInfo.InvariantCulture) : "-").Append(':')
                        .Append(column.numeric_precision.HasValue ? column.numeric_precision.Value.ToString(CultureInfo.InvariantCulture) : "-").Append(':')
                        .Append(column.numeric_scale.HasValue ? column.numeric_scale.Value.ToString(CultureInfo.InvariantCulture) : "-").Append(';');
                }
                canonical.Append("pk=").Append(string.Join(",", table.primary_key.Select(value => value.ToLowerInvariant()))).Append('\n');
            }
            return BridgeCrypto.Sha256Hex(canonical.ToString());
        }

        internal static string QuoteIdentifier(string name)
        {
            return "[" + (name ?? string.Empty).Replace("]", "]]" ) + "]";
        }

        private static int? NullableInt(object value)
        {
            return value == null || value == DBNull.Value ? (int?)null : Convert.ToInt32(value, CultureInfo.InvariantCulture);
        }

        private static string NormalizePath(string path)
        {
            if (string.IsNullOrWhiteSpace(path)) return string.Empty;
            try
            {
                return Path.GetFullPath(path.Trim()).TrimEnd('\\').ToUpperInvariant();
            }
            catch
            {
                return path.Trim().TrimEnd('\\').ToUpperInvariant();
            }
        }
    }
}
