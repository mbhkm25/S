package com.sanadflow.verify;

import android.app.Notification;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.PixelFormat;
import android.os.Build;
import android.provider.Settings;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageButton;

import java.util.Collections;
import java.util.Set;

import org.json.JSONObject;

/**
 * Explicitly opt-in notification listener for selected financial applications.
 *
 * Privacy invariant: no package is monitored by default. The React settings
 * surface must persist an allow-list through AndroidLocalRuntimeBridge before
 * notification content is captured. The original notification remains owned
 * by its source app; SANAD stores only the text evidence required to create a
 * local operation candidate.
 */
public class SanadFinancialNotificationListener extends NotificationListenerService {
    private SharedPreferences prefs;
    private WindowManager windowManager;
    private View floatingView;

    @Override
    public void onCreate() {
        super.onCreate();
        prefs = getSharedPreferences(AndroidLocalRuntimeBridge.PREFS, Context.MODE_PRIVATE);
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || sbn.getNotification() == null) return;
        String packageName = sbn.getPackageName();
        Set<String> allowList = prefs.getStringSet(
            AndroidLocalRuntimeBridge.KEY_MONITORED_PACKAGES,
            Collections.emptySet()
        );
        if (allowList == null || allowList.isEmpty() || !allowList.contains(packageName)) return;

        Notification notification = sbn.getNotification();
        CharSequence title = notification.extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence text = notification.extras.getCharSequence(Notification.EXTRA_TEXT);
        CharSequence bigText = notification.extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
        if (isBlank(title) && isBlank(text) && isBlank(bigText)) return;

        try {
            JSONObject payload = new JSONObject();
            payload.put("packageName", packageName);
            payload.put("appLabel", resolveAppLabel(packageName));
            payload.put("title", title == null ? JSONObject.NULL : title.toString());
            payload.put("text", text == null ? JSONObject.NULL : text.toString());
            payload.put("bigText", bigText == null ? JSONObject.NULL : bigText.toString());
            payload.put("postedAt", sbn.getPostTime());
            payload.put("notificationKey", sbn.getKey());
            prefs.edit()
                .putString(AndroidLocalRuntimeBridge.KEY_NOTIFICATION_JSON, payload.toString())
                .apply();
            showFloatingSanad();
        } catch (Exception ignored) {
            // A malformed notification must never crash the listener process.
        }
    }

    private boolean isBlank(CharSequence value) {
        return value == null || value.toString().trim().isEmpty();
    }

    private String resolveAppLabel(String packageName) {
        try {
            return getPackageManager()
                .getApplicationLabel(getPackageManager().getApplicationInfo(packageName, 0))
                .toString();
        } catch (Exception ignored) {
            return packageName;
        }
    }

    private void showFloatingSanad() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) return;
        if (floatingView != null || windowManager == null) return;

        ImageButton button = new ImageButton(this);
        button.setImageResource(R.mipmap.ic_launcher_round);
        button.setBackgroundResource(android.R.color.transparent);
        button.setContentDescription("فتح إشعار الدفع في سند");
        button.setPadding(6, 6, 6, 6);
        button.setOnClickListener(view -> {
            removeFloatingSanad();
            Intent intent = new Intent(this, PushEnabledMainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            intent.putExtra("sanad_local_notification", true);
            startActivity(intent);
        });

        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;
        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            dp(58),
            dp(58),
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.END | Gravity.CENTER_VERTICAL;
        params.x = dp(12);
        params.y = 0;

        try {
            windowManager.addView(button, params);
            floatingView = button;
        } catch (Exception ignored) {
            floatingView = null;
        }
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void removeFloatingSanad() {
        if (floatingView == null || windowManager == null) return;
        try {
            windowManager.removeView(floatingView);
        } catch (Exception ignored) {
            // Already detached.
        }
        floatingView = null;
    }

    @Override
    public void onDestroy() {
        removeFloatingSanad();
        super.onDestroy();
    }
}
