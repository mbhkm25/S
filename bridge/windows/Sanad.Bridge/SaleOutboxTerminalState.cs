using System;
using System.Data.SQLite;

namespace Sanad.Bridge
{
    internal static class SaleOutboxTerminalState
    {
        public static void MarkBlocked(string eventId, string errorCode)
        {
            Mark(eventId, "blocked", errorCode);
        }

        public static void MarkQuarantined(string eventId, string errorCode)
        {
            Mark(eventId, "quarantined", errorCode);
        }

        private static void Mark(string eventId, string status, string errorCode)
        {
            if (string.IsNullOrWhiteSpace(eventId)) throw new ArgumentException("eventId is required", nameof(eventId));
            if (status != "blocked" && status != "quarantined") throw new ArgumentException("invalid terminal status", nameof(status));

            var safeError = string.IsNullOrWhiteSpace(errorCode) ? "terminal_send_failure" : errorCode.Trim();
            if (safeError.Length > 240) safeError = safeError.Substring(0, 240);

            using (var connection = new SQLiteConnection("Data Source=" + BridgeStateStore.DatabasePath + ";Version=3;Pooling=True;"))
            {
                connection.Open();
                using (var command = new SQLiteCommand(@"
update sale_outbox
set status=@status,
    attempt_count=attempt_count+1,
    next_attempt_at_utc=null,
    last_error=@error,
    sent_at_utc=null,
    ack_protected=null
where event_id=@event and status <> 'sent'", connection))
                {
                    command.Parameters.AddWithValue("@status", status);
                    command.Parameters.AddWithValue("@error", safeError);
                    command.Parameters.AddWithValue("@event", eventId);
                    if (command.ExecuteNonQuery() != 1)
                        throw new InvalidOperationException("sale_outbox_terminal_transition_failed");
                }
            }
        }
    }
}
