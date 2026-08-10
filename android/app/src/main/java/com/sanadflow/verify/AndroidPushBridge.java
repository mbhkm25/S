package com.sanadflow.verify;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONObject;

import java.util.Set;

public final class AndroidPushBridge {
    public static final int NOTIFICATION_PERMISSION_REQUEST_CODE = 9421;
    public static final String CHANNEL_ID = "sanad_operations";
    private static final String TAG = "SANAD_Push";
    private static final String PREFS = "sanad_push";
    private static final String PENDING_ACTION = "pending_native_push_action";

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
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "إشعارات سند", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("تنبيهات العمليات والنشاطات المهمة في سند");
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
    }

    @JavascriptInterface public String getPermissionState() { return permissionState(activity); }

    @JavascriptInterface
    public String consumePendingAction() {
        android.content.SharedPreferences prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String value = prefs.getString(PENDING_ACTION, null);
        if (value != null) prefs.edit().remove(PENDING_ACTION).apply();
        return value == null ? "" : value;
    }

    public void capturePushIntent(Intent intent) {
        if (intent == null || intent.getExtras() == null) return;
        String notificationId = intent.getStringExtra("sanad_notification_id");
        String actionType = intent.getStringExtra("sanad_action_type");
        if ((notificationId == null || notificationId.isEmpty()) && (actionType == null || actionType.isEmpty())) return;
        try {
            JSONObject payload = new JSONObject();
            Set<String> keys = intent.getExtras().keySet();
            for (String key : keys) {
                Object value = intent.getExtras().get(key);
                if (value != null) payload.put(key, String.valueOf(value));
            }
            String serialized = payload.toString();
            activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(PENDING_ACTION, serialized).apply();
            publishAction(serialized);
        } catch (Exception error) {
            Log.e(TAG, "Could not capture native push action", error);
        }
    }

    private void publishAction(String serialized) {
        activity.runOnUiThread(() -> {
            try {
                String script = "window.dispatchEvent(new CustomEvent('sanadNativePushAction',{detail:" + JSONObject.quote(serialized) + "}));";
                webView.evaluateJavascript(script, null);
            } catch (Exception error) {
                Log.e(TAG, "Could not publish native push action", error);
            }
        });
    }

    @JavascriptInterface
    public void register() {
        activity.runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                activity.requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_REQUEST_CODE);
                return;
            }
            fetchAndPublishToken();
        });
    }

    public void onPermissionResult(boolean granted) { if (granted) fetchAndPublishToken(); else publish(null, "denied", "notification_permission_denied"); }
    public void refreshRegistration() { if ("granted".equals(permissionState(activity))) fetchAndPublishToken(); }

    private boolean firebaseReady() {
        try { return !FirebaseApp.getApps(activity).isEmpty(); }
        catch (Throwable error) { Log.w(TAG, "Firebase availability check failed; native push disabled safely", error); return false; }
    }

    private void fetchAndPublishToken() {
        ensureNotificationChannel(activity);
        if (!firebaseReady()) { publish(null, permissionState(activity), "firebase_not_configured"); return; }
        try {
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                if (!task.isSuccessful()) { publish(null, permissionState(activity), "fcm_token_unavailable"); return; }
                String token = task.getResult();
                if (token == null || token.trim().isEmpty()) { publish(null, permissionState(activity), "fcm_token_empty"); return; }
                activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("fcm_token", token).apply();
                publish(token, permissionState(activity), null);
            });
        } catch (Throwable error) { Log.e(TAG, "FCM initialization failed", error); publish(null, permissionState(activity), "fcm_initialization_failed"); }
    }

    private void publish(String token, String permission, String error) {
        activity.runOnUiThread(() -> {
            try {
                JSONObject payload = new JSONObject();
                if (token != null) payload.put("token", token);
                payload.put("permission", permission); payload.put("platform", "android");
                payload.put("appVersion", BuildConfig.VERSION_NAME); payload.put("deviceLabel", Build.MANUFACTURER + " " + Build.MODEL);
                if (error != null) payload.put("error", error);
                webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('sanadNativePushRegistration',{detail:" + payload + "}));", null);
            } catch (Exception exception) { Log.e(TAG, "Could not publish native push registration", exception); }
        });
    }

    public static String permissionState(Context context) {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return "denied";
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return "default";
        return "granted";
    }
}
