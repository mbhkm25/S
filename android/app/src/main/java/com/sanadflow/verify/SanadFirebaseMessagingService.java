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
        getSharedPreferences("sanad_push", Context.MODE_PRIVATE).edit().putString("fcm_token", token).apply();
        Log.i(TAG, "FCM token refreshed; it will be synchronized on next authenticated app session");
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        super.onMessageReceived(message);
        AndroidPushBridge.ensureNotificationChannel(this);

        String title = message.getData().getOrDefault("title", "سند");
        String body = message.getData().getOrDefault("body", "لديك إشعار جديد في سند");
        String notificationId = message.getData().get("sanad_notification_id");

        Intent intent = new Intent(this, PushEnabledMainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        for (Map.Entry<String, String> entry : message.getData().entrySet()) intent.putExtra(entry.getKey(), entry.getValue());

        int requestCode = notificationId == null || notificationId.isEmpty()
            ? (message.getMessageId() == null ? (int) (System.currentTimeMillis() & 0x7fffffff) : message.getMessageId().hashCode())
            : notificationId.hashCode();
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
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
        if (manager != null) manager.notify(requestCode, builder.build());
    }
}
