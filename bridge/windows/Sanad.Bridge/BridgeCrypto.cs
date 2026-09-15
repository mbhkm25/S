using System;
using System.Security.Cryptography;
using System.Text;

namespace Sanad.Bridge
{
    internal static class BridgeCrypto
    {
        public static string GenerateDeviceToken(int bytes = 32)
        {
            var buffer = new byte[bytes];
            using (var rng = RandomNumberGenerator.Create())
            {
                rng.GetBytes(buffer);
            }
            return Base64Url(buffer);
        }

        public static string Sha256Hex(string value)
        {
            if (value == null) throw new ArgumentNullException(nameof(value));
            using (var sha = SHA256.Create())
            {
                var hash = sha.ComputeHash(Encoding.UTF8.GetBytes(value));
                var builder = new StringBuilder(hash.Length * 2);
                foreach (var b in hash) builder.Append(b.ToString("x2"));
                return builder.ToString();
            }
        }

        private static string Base64Url(byte[] value)
        {
            return Convert.ToBase64String(value)
                .TrimEnd('=')
                .Replace('+', '-')
                .Replace('/', '_');
        }
    }
}
