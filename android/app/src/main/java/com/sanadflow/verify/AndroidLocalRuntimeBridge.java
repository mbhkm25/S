package com.sanadflow.verify;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.text.TextUtils;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.work.Constraints;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;

import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.TimeUnit;

import org.json.JSONArray;

public class AndroidLocalRuntimeBridge {
    private static final String UNIQUE_RECOVERY_WORK = "sanad-local-recovery";
    static final String PREFS = SanadLocalRecoveryWorker.PREFS;
    static final String KEY_NOTIFICATION_JSON = "latest_financial_notification";
    static final String KEY_MONITORED_PACKAGES = "monitored_packages";

    private final Activity activity;
    private final WebView webView;
    private final SharedPreferences prefs;

    public AndroidLocalRuntimeBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        this.prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    @JavascriptInterface
    public void scheduleRecovery() {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(SanadLocalRecoveryWorker.class)
            .setConstraints(constraints)
            .setInitialDelay(15, TimeUnit.SECONDS)
            .build();
        WorkManager.getInstance(activity).enqueueUniqueWork(
            UNIQUE_RECOVERY_WORK,
            ExistingWorkPolicy.REPLACE,
            request
        );
    }

    @JavascriptInterface
    public boolean consumeRecoveryDue() {
        boolean due = prefs.getBoolean(SanadLocalRecoveryWorker.KEY_RECOVERY_DUE, false);
        if (due) prefs.edit().putBoolean(SanadLocalRecoveryWorker.KEY_RECOVERY_DUE, false).apply();
        return due;
    }

    @JavascriptInterface
    public String getLatestFinancialNotification() {
        return prefs.getString(KEY_NOTIFICATION_JSON, null);
    }

    @JavascriptInterface
    public void clearLatestFinancialNotification() {
        prefs.edit().remove(KEY_NOTIFICATION_JSON).apply();
    }

    @JavascriptInterface
    public boolean isNotificationAccessEnabled() {
        String enabled = Settings.Secure.getString(activity.getContentResolver(), "enabled_notification_listeners");
        if (enabled == null) return false;
        ComponentName component = new ComponentName(activity, SanadFinancialNotificationListener.class);
        return enabled.contains(component.flattenToString());
    }

    @JavascriptInterface
    public void openNotificationAccessSettings() {
        activity.runOnUiThread(() -> {
            Intent intent = new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS");
            try {
                activity.startActivity(intent);
            } catch (Exception ignored) {
                activity.startActivity(new Intent(Settings.ACTION_SETTINGS));
            }
        });
    }

    @JavascriptInterface
    public boolean canDrawOverlays() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(activity);
    }

    @JavascriptInterface
    public void openOverlaySettings() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
        activity.runOnUiThread(() -> {
            Intent intent = new Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + activity.getPackageName())
            );
            activity.startActivity(intent);
        });
    }

    @JavascriptInterface
    public void setMonitoredPackages(String packagesJson) {
        try {
            JSONArray values = new JSONArray(packagesJson == null ? "[]" : packagesJson);
            Set<String> packages = new HashSet<>();
            for (int i = 0; i < values.length(); i++) {
                String value = values.optString(i, "").trim();
                if (!TextUtils.isEmpty(value)) packages.add(value);
            }
            prefs.edit().putStringSet(KEY_MONITORED_PACKAGES, packages).apply();
        } catch (Exception ignored) {
            // Fail closed: invalid configuration means no package is monitored.
            prefs.edit().putStringSet(KEY_MONITORED_PACKAGES, new HashSet<>()).apply();
        }
    }

    public void dispatchPendingSignals() {
        activity.runOnUiThread(() -> {
            if (webView == null) return;
            if (prefs.getBoolean(SanadLocalRecoveryWorker.KEY_RECOVERY_DUE, false)) {
                webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('sanadNativeLocalRecovery'))",
                    null
                );
            }
            if (prefs.getString(KEY_NOTIFICATION_JSON, null) != null) {
                webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('sanadFinancialNotificationReady'))",
                    null
                );
            }
        });
    }
}
