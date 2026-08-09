package com.sanadflow.verify;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public final class AndroidUpdaterBridge {
    private static final String TAG = "SANAD_Updater";
    private static final String RELEASE_MANIFEST_URL = "https://app.sanadflow.com/downloads/sanad-latest.json";
    private static final String TRUSTED_UPDATE_HOST = "app.sanadflow.com";
    private static final String UPDATE_EVENT = "sanadNativeUpdateStatus";
    private static final long MAX_UPDATE_BYTES = 100L * 1024L * 1024L;
    private static final int MAX_REDIRECTS = 3;
    private static final int CONNECT_TIMEOUT_MS = 15_000;
    private static final int READ_TIMEOUT_MS = 60_000;

    private final Activity activity;
    private final WebView webView;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean checking = new AtomicBoolean(false);
    private final AtomicBoolean updating = new AtomicBoolean(false);

    private volatile boolean destroyed = false;
    private volatile ReleaseInfo latestRelease;
    private volatile File pendingInstallFile;
    private volatile boolean awaitingInstallPermission = false;

    public AndroidUpdaterBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    @JavascriptInterface
    public String getAppInfo() {
        try {
            JSONObject json = new JSONObject();
            json.put("platform", "android");
            json.put("package_name", activity.getPackageName());
            json.put("version_code", getCurrentVersionCode());
            json.put("version_name", BuildConfig.VERSION_NAME);
            json.put("can_request_package_installs", canRequestPackageInstalls());
            return json.toString();
        } catch (Exception error) {
            Log.e(TAG, "Could not serialize app info", error);
            return "{}";
        }
    }

    @JavascriptInterface
    public void checkForUpdate() {
        if (destroyed || !checking.compareAndSet(false, true)) return;
        dispatchStatus("checking", null);

        executor.execute(() -> {
            try {
                ReleaseInfo release = fetchReleaseManifest();
                latestRelease = release;
                long currentVersionCode = getCurrentVersionCode();

                JSONObject details = release.toJson();
                details.put("current_version_code", currentVersionCode);
                details.put("current_version_name", BuildConfig.VERSION_NAME);
                details.put("required", release.isRequiredFor(currentVersionCode));

                if (release.versionCode > currentVersionCode) {
                    dispatchStatus("update_available", details);
                } else {
                    dispatchStatus("up_to_date", details);
                }
            } catch (Exception error) {
                Log.e(TAG, "Update check failed", error);
                dispatchError("check_failed", "تعذر التحقق من وجود تحديث الآن. تحقق من الاتصال وحاول لاحقًا.");
            } finally {
                checking.set(false);
            }
        });
    }

    @JavascriptInterface
    public void startUpdate() {
        if (destroyed || !updating.compareAndSet(false, true)) return;

        executor.execute(() -> {
            try {
                if (pendingInstallFile != null && pendingInstallFile.exists()) {
                    if (requiresUnknownSourcePermission()) {
                        updating.set(false);
                        requestInstallPermission();
                        return;
                    }
                    File readyFile = pendingInstallFile;
                    pendingInstallFile = null;
                    awaitingInstallPermission = false;
                    updating.set(false);
                    launchInstaller(readyFile);
                    return;
                }

                ReleaseInfo release = latestRelease;
                if (release == null) {
                    release = fetchReleaseManifest();
                    latestRelease = release;
                }

                long currentVersionCode = getCurrentVersionCode();
                if (release.versionCode <= currentVersionCode) {
                    updating.set(false);
                    dispatchStatus("up_to_date", release.toJson());
                    return;
                }

                File apkFile = downloadAndVerify(release);
                pendingInstallFile = apkFile;
                dispatchStatus("verified", release.toJson());

                if (requiresUnknownSourcePermission()) {
                    updating.set(false);
                    requestInstallPermission();
                    return;
                }

                pendingInstallFile = null;
                awaitingInstallPermission = false;
                updating.set(false);
                launchInstaller(apkFile);
            } catch (Exception error) {
                updating.set(false);
                pendingInstallFile = null;
                awaitingInstallPermission = false;
                Log.e(TAG, "Update install preparation failed", error);
                dispatchError("update_failed", "تعذر تجهيز تحديث سند بأمان. لم يتم تثبيت أي ملف.");
            }
        });
    }

    public void onHostResume() {
        if (destroyed || !awaitingInstallPermission || pendingInstallFile == null) return;
        if (!pendingInstallFile.exists()) {
            pendingInstallFile = null;
            awaitingInstallPermission = false;
            dispatchError("cached_update_missing", "لم يعد ملف التحديث متاحًا. أعد محاولة التحديث.");
            return;
        }

        if (!requiresUnknownSourcePermission()) {
            File readyFile = pendingInstallFile;
            pendingInstallFile = null;
            awaitingInstallPermission = false;
            launchInstaller(readyFile);
        } else {
            dispatchStatus("permission_required", latestRelease == null ? null : latestRelease.toJson());
        }
    }

    public void destroy() {
        destroyed = true;
        executor.shutdownNow();
    }

    private ReleaseInfo fetchReleaseManifest() throws Exception {
        URL url = new URL(RELEASE_MANIFEST_URL);
        HttpURLConnection connection = openTrustedConnection(url, "GET");
        try {
            byte[] body = readLimited(connection.getInputStream(), 256 * 1024L);
            JSONObject json = new JSONObject(new String(body, StandardCharsets.UTF_8));
            return ReleaseInfo.fromJson(json, url);
        } finally {
            connection.disconnect();
        }
    }

    private File downloadAndVerify(ReleaseInfo release) throws Exception {
        cleanupOldUpdates();
        File updateDir = new File(activity.getCacheDir(), "updates");
        if (!updateDir.exists() && !updateDir.mkdirs()) {
            throw new IllegalStateException("Could not create update cache directory");
        }

        File target = new File(updateDir, "sanad-update-" + release.versionCode + ".apk");
        HttpURLConnection connection = openTrustedConnection(release.downloadUrl, "GET");
        try {
            long contentLength = connection.getContentLengthLong();
            if (contentLength > MAX_UPDATE_BYTES) {
                throw new IllegalStateException("Update exceeds maximum allowed size");
            }
            if (release.sizeBytes > 0 && contentLength > 0 && release.sizeBytes != contentLength) {
                throw new SecurityException("Update size does not match release manifest");
            }

            long total = 0L;
            int lastPercent = -1;
            try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(target)) {
                byte[] buffer = new byte[32 * 1024];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    total += read;
                    if (total > MAX_UPDATE_BYTES) {
                        throw new IllegalStateException("Update exceeds maximum allowed size");
                    }
                    output.write(buffer, 0, read);

                    if (contentLength > 0) {
                        int percent = (int) Math.min(100L, (total * 100L) / contentLength);
                        if (percent == 100 || percent >= lastPercent + 5) {
                            lastPercent = percent;
                            JSONObject progress = release.toJson();
                            progress.put("percent", percent);
                            progress.put("downloaded_bytes", total);
                            progress.put("total_bytes", contentLength);
                            dispatchStatus("downloading", progress);
                        }
                    }
                }
                output.getFD().sync();
            }

            if (release.sizeBytes > 0 && total != release.sizeBytes) {
                throw new SecurityException("Downloaded update size does not match release manifest");
            }
        } catch (Exception error) {
            //noinspection ResultOfMethodCallIgnored
            target.delete();
            throw error;
        } finally {
            connection.disconnect();
        }

        String actualSha256 = sha256(target);
        if (!actualSha256.equalsIgnoreCase(release.sha256)) {
            //noinspection ResultOfMethodCallIgnored
            target.delete();
            throw new SecurityException("Downloaded update SHA-256 mismatch");
        }

        verifyApkIdentity(target, release);
        return target;
    }

    private void verifyApkIdentity(File apkFile, ReleaseInfo release) throws Exception {
        PackageManager packageManager = activity.getPackageManager();
        int signingFlags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
            ? PackageManager.GET_SIGNING_CERTIFICATES
            : PackageManager.GET_SIGNATURES;

        PackageInfo installed = packageManager.getPackageInfo(activity.getPackageName(), signingFlags);
        PackageInfo candidate = packageManager.getPackageArchiveInfo(apkFile.getAbsolutePath(), signingFlags);
        if (candidate == null) throw new SecurityException("Downloaded file is not a valid APK");
        if (!activity.getPackageName().equals(candidate.packageName)) {
            throw new SecurityException("APK package name does not match SANAD");
        }

        long candidateVersionCode = getVersionCode(candidate);
        if (candidateVersionCode != release.versionCode || candidateVersionCode <= getCurrentVersionCode()) {
            throw new SecurityException("APK version does not match release manifest or is not newer");
        }

        if (candidate.applicationInfo != null
            && (candidate.applicationInfo.flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            throw new SecurityException("Debug APK cannot be installed through production updater");
        }

        if (!signingLineageMatches(installed, candidate)) {
            throw new SecurityException("APK signing certificate does not match installed SANAD");
        }
    }

    private boolean signingLineageMatches(PackageInfo installed, PackageInfo candidate) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            if (installed.signingInfo == null || candidate.signingInfo == null) return false;
            Signature[] currentSigners = installed.signingInfo.getApkContentsSigners();
            Signature[] candidateHistory = candidate.signingInfo.hasPastSigningCertificates()
                ? candidate.signingInfo.getSigningCertificateHistory()
                : candidate.signingInfo.getApkContentsSigners();
            for (Signature current : currentSigners) {
                String currentDigest = signatureDigest(current);
                for (Signature candidateSigner : candidateHistory) {
                    if (currentDigest.equals(signatureDigest(candidateSigner))) return true;
                }
            }
            return false;
        }

        if (installed.signatures == null || candidate.signatures == null) return false;
        for (Signature current : installed.signatures) {
            String currentDigest = signatureDigest(current);
            for (Signature candidateSigner : candidate.signatures) {
                if (currentDigest.equals(signatureDigest(candidateSigner))) return true;
            }
        }
        return false;
    }

    private String signatureDigest(Signature signature) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        return toHex(digest.digest(signature.toByteArray()));
    }

    private long getCurrentVersionCode() {
        return BuildConfig.VERSION_CODE;
    }

    private long getVersionCode(PackageInfo info) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
    }

    private boolean requiresUnknownSourcePermission() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !canRequestPackageInstalls();
    }

    private boolean canRequestPackageInstalls() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O || activity.getPackageManager().canRequestPackageInstalls();
    }

    private void requestInstallPermission() {
        awaitingInstallPermission = true;
        dispatchStatus("permission_required", latestRelease == null ? null : latestRelease.toJson());
        activity.runOnUiThread(() -> {
            try {
                Intent settingsIntent = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + activity.getPackageName())
                );
                activity.startActivity(settingsIntent);
            } catch (Exception error) {
                Log.e(TAG, "Could not open install permission settings", error);
                dispatchError("permission_settings_failed", "افتح إعدادات Android واسمح لسند بتثبيت التحديثات من هذا المصدر.");
            }
        });
    }

    private void launchInstaller(File apkFile) {
        activity.runOnUiThread(() -> {
            try {
                Uri apkUri = FileProvider.getUriForFile(
                    activity,
                    activity.getPackageName() + ".fileprovider",
                    apkFile
                );
                Intent installIntent = new Intent(Intent.ACTION_INSTALL_PACKAGE);
                installIntent.setData(apkUri);
                installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                dispatchStatus("installer_opened", latestRelease == null ? null : latestRelease.toJson());
                activity.startActivity(installIntent);
            } catch (Exception error) {
                Log.e(TAG, "Could not launch Android package installer", error);
                dispatchError("installer_failed", "تم تنزيل التحديث والتحقق منه، لكن تعذر فتح شاشة تثبيت Android.");
            }
        });
    }

    private void cleanupOldUpdates() {
        File updateDir = new File(activity.getCacheDir(), "updates");
        File[] files = updateDir.listFiles();
        if (files == null) return;
        for (File file : files) {
            if (file.isFile() && file.getName().startsWith("sanad-update-") && file.getName().endsWith(".apk")) {
                //noinspection ResultOfMethodCallIgnored
                file.delete();
            }
        }
    }

    private HttpURLConnection openTrustedConnection(URL initialUrl, String method) throws Exception {
        URL current = initialUrl;
        for (int redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
            validateTrustedUrl(current);
            HttpURLConnection connection = (HttpURLConnection) current.openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setRequestMethod(method);
            connection.setRequestProperty("Accept", method.equals("GET") && current.getPath().endsWith(".json") ? "application/json" : "application/vnd.android.package-archive,*/*");
            connection.setRequestProperty("Cache-Control", "no-cache");
            connection.setRequestProperty("User-Agent", "SANAD-Android-Updater/" + BuildConfig.VERSION_NAME);

            int status = connection.getResponseCode();
            if (status >= 300 && status < 400) {
                String location = connection.getHeaderField("Location");
                connection.disconnect();
                if (location == null || location.trim().isEmpty()) {
                    throw new IllegalStateException("Update server returned redirect without location");
                }
                current = new URL(current, location);
                continue;
            }
            if (status < 200 || status >= 300) {
                connection.disconnect();
                throw new IllegalStateException("Update server returned HTTP " + status);
            }
            return connection;
        }
        throw new SecurityException("Too many update redirects");
    }

    private void validateTrustedUrl(URL url) throws Exception {
        if (!"https".equalsIgnoreCase(url.getProtocol())) {
            throw new SecurityException("Update URL must use HTTPS");
        }
        if (!TRUSTED_UPDATE_HOST.equalsIgnoreCase(url.getHost())) {
            throw new SecurityException("Update URL host is not trusted");
        }
        if (url.getUserInfo() != null || url.getPort() != -1) {
            throw new SecurityException("Update URL contains unsupported authority components");
        }
    }

    private byte[] readLimited(InputStream input, long maxBytes) throws Exception {
        try (InputStream stream = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            long total = 0;
            int read;
            while ((read = stream.read(buffer)) != -1) {
                total += read;
                if (total > maxBytes) throw new IllegalStateException("Response is too large");
                output.write(buffer, 0, read);
            }
            return output.toByteArray();
        }
    }

    private String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (FileInputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[32 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) digest.update(buffer, 0, read);
        }
        return toHex(digest.digest());
    }

    private String toHex(byte[] bytes) {
        StringBuilder builder = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) builder.append(String.format(Locale.US, "%02x", value & 0xff));
        return builder.toString();
    }

    private void dispatchError(String code, String message) {
        try {
            JSONObject details = new JSONObject();
            details.put("code", code);
            details.put("message", message);
            dispatchStatus("error", details);
        } catch (Exception ignored) {
            dispatchStatus("error", null);
        }
    }

    private void dispatchStatus(String status, JSONObject details) {
        if (destroyed) return;
        activity.runOnUiThread(() -> {
            if (destroyed || webView == null) return;
            try {
                JSONObject payload = details == null ? new JSONObject() : new JSONObject(details.toString());
                payload.put("status", status);
                String encoded = JSONObject.quote(payload.toString());
                webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('" + UPDATE_EVENT + "',{detail:JSON.parse(" + encoded + ")}));",
                    null
                );
            } catch (Exception error) {
                Log.e(TAG, "Could not dispatch updater status", error);
            }
        });
    }

    private static final class ReleaseInfo {
        final long versionCode;
        final String versionName;
        final long minimumSupportedVersionCode;
        final String updatePolicy;
        final JSONArray releaseNotes;
        final URL downloadUrl;
        final String sha256;
        final long sizeBytes;
        final String builtAt;
        final String commit;

        private ReleaseInfo(
            long versionCode,
            String versionName,
            long minimumSupportedVersionCode,
            String updatePolicy,
            JSONArray releaseNotes,
            URL downloadUrl,
            String sha256,
            long sizeBytes,
            String builtAt,
            String commit
        ) {
            this.versionCode = versionCode;
            this.versionName = versionName;
            this.minimumSupportedVersionCode = minimumSupportedVersionCode;
            this.updatePolicy = updatePolicy;
            this.releaseNotes = releaseNotes;
            this.downloadUrl = downloadUrl;
            this.sha256 = sha256;
            this.sizeBytes = sizeBytes;
            this.builtAt = builtAt;
            this.commit = commit;
        }

        static ReleaseInfo fromJson(JSONObject json, URL manifestUrl) throws Exception {
            if (!"android".equalsIgnoreCase(json.optString("platform"))) {
                throw new SecurityException("Release manifest platform mismatch");
            }
            long versionCode = json.optLong("version_code", -1L);
            if (versionCode < 1) throw new IllegalStateException("Release manifest has invalid version code");

            String versionName = json.optString("version_name", "").trim();
            if (versionName.isEmpty()) throw new IllegalStateException("Release manifest has no version name");

            long minimumSupported = json.optLong("minimum_supported_version_code", 1L);
            if (minimumSupported < 1 || minimumSupported > versionCode) {
                throw new IllegalStateException("Release manifest has invalid minimum supported version");
            }

            String updatePolicy = json.optString("update_policy", "recommended").trim().toLowerCase(Locale.US);
            if (!"recommended".equals(updatePolicy) && !"required".equals(updatePolicy)) {
                throw new IllegalStateException("Release manifest has invalid update policy");
            }

            JSONArray notes = json.optJSONArray("release_notes");
            if (notes == null) notes = new JSONArray();

            String rawDownloadUrl = json.optString("download_url", "").trim();
            if (rawDownloadUrl.isEmpty()) throw new IllegalStateException("Release manifest has no download URL");
            URL resolvedDownloadUrl = new URL(manifestUrl, rawDownloadUrl);

            String sha256 = json.optString("sha256", "").trim().toLowerCase(Locale.US);
            if (!sha256.matches("^[0-9a-f]{64}$")) {
                throw new SecurityException("Release manifest has invalid SHA-256");
            }

            long sizeBytes = json.optLong("size_bytes", -1L);
            if (sizeBytes <= 0 || sizeBytes > MAX_UPDATE_BYTES) {
                throw new SecurityException("Release manifest has invalid APK size");
            }

            return new ReleaseInfo(
                versionCode,
                versionName,
                minimumSupported,
                updatePolicy,
                notes,
                resolvedDownloadUrl,
                sha256,
                sizeBytes,
                json.optString("built_at", ""),
                json.optString("commit", "")
            );
        }

        boolean isRequiredFor(long currentVersionCode) {
            return "required".equals(updatePolicy) || currentVersionCode < minimumSupportedVersionCode;
        }

        JSONObject toJson() {
            try {
                JSONObject json = new JSONObject();
                json.put("version_code", versionCode);
                json.put("version_name", versionName);
                json.put("minimum_supported_version_code", minimumSupportedVersionCode);
                json.put("update_policy", updatePolicy);
                json.put("release_notes", new JSONArray(releaseNotes.toString()));
                json.put("download_url", downloadUrl.toString());
                json.put("sha256", sha256);
                json.put("size_bytes", sizeBytes);
                json.put("built_at", builtAt);
                json.put("commit", commit);
                return json;
            } catch (Exception error) {
                return new JSONObject();
            }
        }
    }
}
