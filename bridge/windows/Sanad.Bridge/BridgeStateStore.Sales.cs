namespace Sanad.Bridge
{
    internal static class BridgeStateStoreSalesExtensions
    {
        public static long? GetSaleWatermark(this BridgeStateStore state, string sourceKey)
        {
            using (var sales = new SaleStateStore())
                return sales.GetWatermark(sourceKey);
        }

        public static void InitializeSaleWatermark(this BridgeStateStore state, string sourceKey, long invoiceId)
        {
            using (var sales = new SaleStateStore())
                sales.InitializeWatermark(sourceKey, invoiceId);
        }

        public static bool QueueSaleBundle(this BridgeStateStore state, string sourceKey, long invoiceId, string eventId, string bodyJson)
        {
            using (var sales = new SaleStateStore())
                return sales.QueueBundle(sourceKey, invoiceId, eventId, bodyJson);
        }

        public static int CountPendingSaleEvents(this BridgeStateStore state, string sourceKey)
        {
            using (var sales = new SaleStateStore())
                return sales.CountPending(sourceKey);
        }
    }
}
