using System;
using System.IO;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Web.Script.Serialization;

namespace Sanad.Bridge
{
    internal static class ProtectedIdentityStore
    {
        private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("SANAD.Bridge.Identity.v1");
        private static readonly JavaScriptSerializer Json = new JavaScriptSerializer();

        public static string IdentityPath
        {
            get
            {
                var directory = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                    "SANAD",
                    "Bridge");
                return Path.Combine(directory, "identity.dat");
            }
        }

        public static void Save(StoredBridgeIdentity identity)
        {
            if (identity == null) throw new ArgumentNullException(nameof(identity));
            if (string.IsNullOrWhiteSpace(identity.device_token)) throw new InvalidOperationException("Device token is required.");

            var path = IdentityPath;
            var directory = Path.GetDirectoryName(path);
            Directory.CreateDirectory(directory);

            var plaintext = Encoding.UTF8.GetBytes(Json.Serialize(identity));
            var ciphertext = ProtectedData.Protect(plaintext, Entropy, DataProtectionScope.LocalMachine);
            File.WriteAllBytes(path, ciphertext);
            RestrictFile(path);
        }

        public static StoredBridgeIdentity Load()
        {
            var path = IdentityPath;
            if (!File.Exists(path)) return null;
            var ciphertext = File.ReadAllBytes(path);
            var plaintext = ProtectedData.Unprotect(ciphertext, Entropy, DataProtectionScope.LocalMachine);
            return Json.Deserialize<StoredBridgeIdentity>(Encoding.UTF8.GetString(plaintext));
        }

        private static void RestrictFile(string path)
        {
            try
            {
                var security = new FileSecurity();
                security.SetAccessRuleProtection(true, false);

                var currentUser = WindowsIdentity.GetCurrent().User;
                if (currentUser != null)
                {
                    security.AddAccessRule(new FileSystemAccessRule(
                        currentUser,
                        FileSystemRights.FullControl,
                        AccessControlType.Allow));
                }

                var systemSid = new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null);
                security.AddAccessRule(new FileSystemAccessRule(
                    systemSid,
                    FileSystemRights.FullControl,
                    AccessControlType.Allow));

                File.SetAccessControl(path, security);
            }
            catch
            {
                // DPAPI remains the cryptographic boundary even if ACL hardening is unavailable.
            }
        }
    }
}
