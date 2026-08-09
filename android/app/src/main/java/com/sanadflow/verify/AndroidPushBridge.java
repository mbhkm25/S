package com.sanadflow.verify;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONObject;

public final class AndroidPushBridge {
    public static final int NOTIFICATION_PERMISSION_REQUEST_CODE = 9421;
    public static final String CHANNEL_ID = "sanad_operations";
    private static final String TAG = "SANAD_Push";

    private final Activity activity;
    private final WebView webView;

    public AndroidPushBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        ensureNotificationChannel(activity);
    }

    public static void ensureNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "إشعارات سند",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("تنبيهات العمليات والنشاطات المهمة في سند");
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
    }

    @JavascriptInterface
    public String getPermissionState() {
        return permissionState(activity);
    }

    @JavascriptInterface
    public void register() {
        activity.runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                activity.requestPermissions(
                    new String[]{Manifest.permission.POST_NOTIFICATIONS},
                    NOTIFICATION_PERMISSION_REQUEST_CODE
                );
                return;
            }
            fetchAndPublishToken();
        });
    }

    public void onPermissionResult(boolean granted) {
        if (granted) {
            fetchAndPublishToken();
        } else {
            publish(null, "denied", "notification_permission_denied");
        }
    }

    public void refreshRegistration() {
        if ("granted".equals(permissionState(activity))) fetchAndPublishToken();
    }

    private void fetchAndPublishToken() {
        ensureNotificationChannel(activity);
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            if (!task.isSuccessful()) {
                Log.w(TAG, "FCM token unavailable", task.getException());
                publish(null, permissionState(activity), "fcm_token_unavailable");
                return;
            }
            String token = task.getResult();
            if (token == null || token.trim().isEmpty()) {
                publish(null, permissionState(activity), "fcm_token_empty");
                return;
            }
            activity.getSharedPreferences("sanad_push", Context.MODE_PRIVATE)
                .edit().putString("fcm_token", token).apply();
            publish(token, permissionState(activity), null);
        });
    }

    private void publish(String token, String permission, String error) {
        activity.runOnUiThread(() -> {
            try {
                JSONObject payload = new JSONObject();
                if (token != null) payload.put("token", token);
                payload.put("permission", permission);
                payload.put("platform", "android");
                payload.put("appVersion", BuildConfig.VERSION_NAME);
                payload.put("deviceLabel", Build.MANUFACTURER + " " + Build.MODEL);
                if (error != null) payload.put("error", error);
                String script = "window.dispatchEvent(new CustomEvent('sanadNativePushRegistration',{detail:" + payload.toString() + "}));";
                webView.evaluateJavascript(script, null);
            } catch (Exception exception) {
                Log.e(TAG, "Could not publish native push registration", exception);
            }
        });
    }

    public static String permissionState(Context context) {
        boolean enabled = NotificationManagerCompat.from(context).areNotificationsEnabled();
        if (!enabled) return "denied";
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return "default";
        }
        return "granted";
    }
}
