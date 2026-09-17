using System;
using System.Threading;
using System.Threading.Tasks;

namespace Sanad.Bridge
{
    internal static class BridgeAgentCycleCommand
    {
        private const string GlobalMutexName = @"Global\SANAD.Bridge.AgentCycle.v1";
        private const string LocalMutexName = @"Local\SANAD.Bridge.AgentCycle.v1";

        public static async Task<int> RunAsync(string[] args)
        {
            Mutex mutex = null;
            var ownsMutex = false;
            try
            {
                mutex = CreateMutex();
                try
                {
                    ownsMutex = mutex.WaitOne(0, false);
                }
                catch (AbandonedMutexException)
                {
                    ownsMutex = true;
                }

                if (!ownsMutex)
                {
                    Console.Error.WriteLine("SANAD Bridge agent cycle skipped: another cycle is already running on this machine.");
                    return 28;
                }

                Console.WriteLine("SANAD Bridge agent cycle");
                Console.WriteLine("Mode: single-instance heartbeat -> reconcile scan -> durable cloud delivery");
                Console.WriteLine();

                var heartbeatCode = await BridgeHeartbeatCommand.RunAsync(args).ConfigureAwait(false);

                Console.WriteLine();
                Console.WriteLine("=== LOCAL RECONCILIATION ===");
                var scanCode = EdaaSaleChangeDetector.Run(args);

                var senderCode = 0;
                if (heartbeatCode == 0)
                {
                    Console.WriteLine();
                    Console.WriteLine("=== CLOUD DELIVERY ===");
                    senderCode = await SaleCloudSender.RunAsync(args).ConfigureAwait(false);
                }
                else
                {
                    Console.WriteLine();
                    Console.WriteLine("Cloud delivery skipped because heartbeat was not acknowledged.");
                    Console.WriteLine("Local scan still ran, so newly observed Edaa changes remain durable in the outbox.");
                }

                Console.WriteLine();
                Console.WriteLine("Agent cycle summary");
                Console.WriteLine("  Heartbeat : " + heartbeatCode);
                Console.WriteLine("  Scan      : " + scanCode);
                Console.WriteLine("  Sender    : " + (heartbeatCode == 0 ? senderCode.ToString() : "skipped"));
                Console.WriteLine("  Lock      : released at cycle end");

                if (heartbeatCode != 0) return heartbeatCode;
                if (scanCode != 0 && scanCode != 24) return scanCode;
                if (senderCode != 0) return senderCode;
                return scanCode;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("SANAD Bridge agent cycle stopped safely: " + ex.Message);
                return 1;
            }
            finally
            {
                if (ownsMutex && mutex != null)
                {
                    try { mutex.ReleaseMutex(); } catch { }
                }
                if (mutex != null) mutex.Dispose();
            }
        }

        private static Mutex CreateMutex()
        {
            try
            {
                return new Mutex(false, GlobalMutexName);
            }
            catch (UnauthorizedAccessException)
            {
                return new Mutex(false, LocalMutexName);
            }
        }
    }
}
