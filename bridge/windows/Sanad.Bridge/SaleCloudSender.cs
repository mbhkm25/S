using System;
using System.Collections.Generic;
using System.Data.SQLite;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace Sanad.Bridge
{
    internal static class SaleCloudSender
    {
        private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("SANAD.Bridge.SaleOutbox.v1");
        private static readonly JavaScriptSerializer Json = new JavaScriptSerializer
        {
            MaxJsonLength = int.MaxValue,
            RecursionLimit = 300
        };

        public static async Task<int> RunAsync(string[] args)
        {
            try
            {
                var invoiceId = ParseInvoiceId(args);
                var maxEvents = ParseMaxEvents(args) ?? 10;

                Console.WriteLine("SANAD Bridge sale cloud sender");
                Console.WriteLine("Mode: device-authenticated HTTPS + durable ACK/retry state");
                Console.WriteLine();

                var identity = ProtectedIdentityStore.Load();
                if (identity == null || string.IsNullOrWhiteSpace(identity.device_public_id) || string.IsNullOrWhiteSpace(identity.device_token))
                {
                    Console.Error.WriteLine("No authorized SANAD Bridge device identity is available on this machine.");
                    return 22;
                }

                var discovery = EdaaDiscoveryService.Discover();
                if (!string.Equals(identity.source_key, discovery.SourceKey, StringComparison.Ordinal))
                {
                    Console.Error.WriteLine("The authorized SANAD source does not match the active Edaa source. Cloud send blocked.");
                    return 23;
                }

                Console.WriteLine("Edaa database : " + discovery.DatabaseName);
                Console.WriteLine("Source key    : " + discovery.SourceKey);
                Console.WriteLine("Device ID     : " + identity.device_public_id);
                Console.WriteLine("Business      : " + (identity.business_name ?? identity.business_id ?? "unknown"));
                Console.WriteLine();

                var due = ReadDueEvents(discovery.SourceKey, invoiceId, maxEvents);
                if (due.Count == 0)
                {
                    Console.WriteLine(invoiceId.HasValue
                        ? "No due production envelope found for invoice " + invoiceId.Value + "."
                        : "No due production sale envelopes are waiting for cloud delivery.");
                    return 0;
                }

                var apiUrl = Environment.GetEnvironmentVariable("SANAD_API_URL") ?? "https://api.sanadflow.com";
                var publicApiKey = Environment.GetEnvironmentVariable("SANAD_PUBLIC_API_KEY");
                var sent = 0;
                var failed = 0;
                var blocked = 0;
                var quarantined = 0;

                using (var state = new SaleStateStore())
                using (var cloud = new BridgeCloudClient(apiUrl, identity, publicApiKey))
                {
                    foreach (var item in due)
                    {
                        string validationError;
                        if (!ValidateProductionEnvelope(item, out validationError))
                        {
                            SaleOutboxTerminalState.MarkQuarantined(item.EventId, validationError);
                            quarantined++;
                            Console.WriteLine("QUARANTINED invoice " + item.InvoiceId + ": " + validationError);
                            continue;
                        }

                        Console.WriteLine("Sending invoice " + item.InvoiceId + " revision " + Short(item.Revision) + " ...");
                        try
                        {
                            using (var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(60)))
                            {
                                var ack = await cloud.SendEventAsync(item.BodyJson, timeout.Token).ConfigureAwait(false);
                                state.MarkSent(item.EventId, ack);
                                sent++;
                                Console.WriteLine("ACK invoice " + item.InvoiceId + ": " + CompactAck(ack));
                            }
                        }
                        catch (OperationCanceledException)
                        {
                            state.MarkFailed(item.EventId, "send_timeout");
                            failed++;
                            Console.WriteLine("FAILED invoice " + item.InvoiceId + ": send_timeout");
                        }
                        catch (BridgeCloudException ex)
                        {
                            if (ex.StatusCode == 401 || ex.StatusCode == 403)
                            {
                                SaleOutboxTerminalState.MarkBlocked(item.EventId, ex.Message);
                                blocked++;
                                Console.WriteLine("BLOCKED invoice " + item.InvoiceId + ": " + ex.Message + " (HTTP " + ex.StatusCode + ")");
                            }
                            else if (ex.StatusCode == 400 || ex.StatusCode == 409)
                            {
                                SaleOutboxTerminalState.MarkQuarantined(item.EventId, ex.Message);
                                quarantined++;
                                Console.WriteLine("QUARANTINED invoice " + item.InvoiceId + ": " + ex.Message + " (HTTP " + ex.StatusCode + ")");
                            }
                            else
                            {
                                state.MarkFailed(item.EventId, ex.Message);
                                failed++;
                                Console.WriteLine("FAILED invoice " + item.InvoiceId + ": " + ex.Message + " (HTTP " + ex.StatusCode + ")");
                            }
                        }
                        catch (Exception ex)
                        {
                            state.MarkFailed(item.EventId, ex.GetType().Name);
                            failed++;
                            Console.WriteLine("FAILED invoice " + item.InvoiceId + ": " + ex.GetType().Name);
                        }
                    }
                }

                Console.WriteLine();
                Console.WriteLine("Cloud sender summary");
                Console.WriteLine("  Due selected : " + due.Count);
                Console.WriteLine("  Sent/ACKed   : " + sent);
                Console.WriteLine("  Retryable    : " + failed);
                Console.WriteLine("  Blocked      : " + blocked);
                Console.WriteLine("  Quarantined  : " + quarantined);
                Console.WriteLine("  Pending now  : " + CountPending(discovery.SourceKey));
                Console.WriteLine();
                Console.WriteLine("No writes were performed against Edaa.");

                if (blocked > 0 || quarantined > 0) return 27;
                return failed > 0 ? 7 : 0;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("Sale cloud sender stopped safely: " + ex.Message);
                return 1;
            }
        }

        private static List<LocalSaleOutboxItem> ReadDueEvents(string sourceKey, long? invoiceId, int maxEvents)
        {
            var result = new List<LocalSaleOutboxItem>();
            using (var connection = new SQLiteConnection("Data Source=" + BridgeStateStore.DatabasePath + ";Version=3;Pooling=True;Read Only=True;"))
            {
                connection.Open();
                var sql = @"
select event_id, source_key, invoice_id, revision, body_protected, status,
       attempt_count, next_attempt_at_utc, last_error,
       created_at_utc, sent_at_utc, ack_protected
from sale_outbox
where source_key=@source
  and status in ('pending','failed')
  and (next_attempt_at_utc is null or next_attempt_at_utc <= @now)
  and revision not like 'legacy:%'";

                if (invoiceId.HasValue)
                    sql += " and invoice_id=@invoice ";

                sql += " order by created_at_utc, event_id limit " + maxEvents.ToString(CultureInfo.InvariantCulture);

                using (var command = new SQLiteCommand(sql, connection))
                {
                    command.Parameters.AddWithValue("@source", sourceKey);
                    command.Parameters.AddWithValue("@now", DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture));
                    if (invoiceId.HasValue) command.Parameters.AddWithValue("@invoice", invoiceId.Value);

                    using (var reader = command.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            result.Add(new LocalSaleOutboxItem
                            {
                                EventId = reader.GetString(0),
                                SourceKey = reader.GetString(1),
                                InvoiceId = Convert.ToInt64(reader[2], CultureInfo.InvariantCulture),
                                Revision = reader.GetString(3),
                                BodyJson = Unprotect((byte[])reader[4]),
                                Status = reader.GetString(5),
                                AttemptCount = Convert.ToInt32(reader[6], CultureInfo.InvariantCulture),
                                NextAttemptAtUtc = ParseUtc(reader, 7),
                                LastError = reader.IsDBNull(8) ? null : reader.GetString(8),
                                CreatedAtUtc = ParseUtc(reader, 9) ?? DateTime.MinValue,
                                SentAtUtc = ParseUtc(reader, 10),
                                AckJson = reader.IsDBNull(11) ? null : Unprotect((byte[])reader[11])
                            });
                        }
                    }
                }
            }
            return result;
        }

        private static bool ValidateProductionEnvelope(LocalSaleOutboxItem item, out string error)
        {
            error = null;
            Dictionary<string, object> envelope;
            try
            {
                envelope = Json.Deserialize<Dictionary<string, object>>(item.BodyJson);
            }
            catch
            {
                error = "invalid_envelope_json";
                return false;
            }

            if (envelope == null)
            {
                error = "invalid_envelope_json";
                return false;
            }

            if (!EqualsText(envelope, "event_id", item.EventId))
            {
                error = "event_id_mismatch";
                return false;
            }
            if (!EqualsText(envelope, "revision", item.Revision))
            {
                error = "revision_mismatch";
                return false;
            }
            if (!EqualsText(envelope, "entity_type", "sale"))
            {
                error = "unsupported_entity_type";
                return false;
            }

            object version;
            if (!envelope.TryGetValue("event_schema_version", out version) || Convert.ToInt32(version, CultureInfo.InvariantCulture) != 1)
            {
                error = "unsupported_event_schema_version";
                return false;
            }

            object payload;
            if (!envelope.TryGetValue("payload", out payload) || payload == null)
            {
                error = "missing_payload";
                return false;
            }

            return true;
        }

        private static bool EqualsText(Dictionary<string, object> values, string key, string expected)
        {
            object value;
            return values.TryGetValue(key, out value) &&
                   string.Equals(Convert.ToString(value, CultureInfo.InvariantCulture), expected, StringComparison.Ordinal);
        }

        private static int CountPending(string sourceKey)
        {
            using (var state = new SaleStateStore())
                return state.CountPending(sourceKey);
        }

        private static string CompactAck(string ack)
        {
            if (string.IsNullOrWhiteSpace(ack)) return "{}";
            var text = ack.Replace("\r", " ").Replace("\n", " ").Trim();
            return text.Length <= 240 ? text : text.Substring(0, 240) + "...";
        }

        private static string Short(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return "?";
            return value.Length <= 12 ? value : value.Substring(0, 12);
        }

        private static byte[] UnprotectBytes(byte[] protectedBytes)
        {
            return ProtectedData.Unprotect(protectedBytes, Entropy, DataProtectionScope.LocalMachine);
        }

        private static string Unprotect(byte[] protectedBytes)
        {
            return Encoding.UTF8.GetString(UnprotectBytes(protectedBytes));
        }

        private static DateTime? ParseUtc(SQLiteDataReader reader, int ordinal)
        {
            if (reader.IsDBNull(ordinal)) return null;
            DateTime parsed;
            return DateTime.TryParse(reader.GetString(ordinal), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out parsed)
                ? (DateTime?)parsed
                : null;
        }

        private static long? ParseInvoiceId(string[] args)
        {
            if (args == null) return null;
            for (var i = 0; i < args.Length; i++)
            {
                if (!string.Equals(args[i], "--invoice-id", StringComparison.OrdinalIgnoreCase)) continue;
                if (i + 1 >= args.Length) throw new ArgumentException("--invoice-id requires a numeric value.");
                long value;
                if (!long.TryParse(args[i + 1], NumberStyles.Integer, CultureInfo.InvariantCulture, out value))
                    throw new ArgumentException("Invalid --invoice-id value.");
                return value;
            }
            return null;
        }

        private static int? ParseMaxEvents(string[] args)
        {
            if (args == null) return null;
            for (var i = 0; i < args.Length; i++)
            {
                if (!string.Equals(args[i], "--max-events", StringComparison.OrdinalIgnoreCase)) continue;
                if (i + 1 >= args.Length) throw new ArgumentException("--max-events requires a numeric value.");
                int value;
                if (!int.TryParse(args[i + 1], NumberStyles.Integer, CultureInfo.InvariantCulture, out value) || value < 1 || value > 100)
                    throw new ArgumentException("--max-events must be between 1 and 100.");
                return value;
            }
            return null;
        }
    }
}
