package com.sanadflow.verify;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

public class SanadFirebaseMessagingService extends FirebaseMessagingService {
    private static final String TAG = "SANAD_FCM";

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        getSharedPreferences("sanad_push", Context.MODE_PRIVATE)
            .edit().putString("fcm_token", token).apply();
        Log.i(TAG, "FCM token refreshed; it will be synchronized on next authenticated app session");
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        super.onMessageReceived(message);
        AndroidPushBridge.ensureNotificationChannel(this);

        RemoteMessage.Notification notification = message.getNotification();
        String title = notification != null && notification.getTitle() != null
            ? notification.getTitle()
            : message.getData().getOrDefault("title", "سند");
        String body = notification != null && notification.getBody() != null
            ? notification.getBody()
            : message.getData().getOrDefault("body", "لديك إشعار جديد في سند");

        // Android itself displays notification payloads while the app is backgrounded.
        // This service path is primarily for foreground/data-only deliveries.
        if (notification != null && !isAppInForeground()) return;

        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        for (Map.Entry<String, String> entry : message.getData().entrySet()) {
            intent.putExtra(entry.getKey(), entry.getValue());
        }
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            message.getMessageId() == null ? 0 : message.getMessageId().hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, AndroidPushBridge.CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pendingIntent);

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            int id = message.getMessageId() == null ? (int) (System.currentTimeMillis() & 0x7fffffff) : message.getMessageId().hashCode();
            manager.notify(id, builder.build());
        }
    }

    private boolean isAppInForeground() {
        android.app.ActivityManager manager = (android.app.ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
        if (manager == null) return false;
        java.util.List<android.app.ActivityManager.RunningAppProcessInfo> processes = manager.getRunningAppProcesses();
        if (processes == null) return false;
        String packageName = getPackageName();
        for (android.app.ActivityManager.RunningAppProcessInfo process : processes) {
            if (packageName.equals(process.processName)) {
                return process.importance == android.app.ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND;
            }
        }
        return false;
    }
}
