package com.sanadflow.verify;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.util.Log;
import android.webkit.WebView;

public class PushEnabledMainActivity extends MainActivity {
    private static final String TAG = "SANAD_PushActivity";
    private AndroidPushBridge androidPushBridge;
    private AndroidLocalRuntimeBridge androidLocalRuntimeBridge;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = this.bridge == null ? null : this.bridge.getWebView();
        if (webView != null) {
            androidPushBridge = new AndroidPushBridge(this, webView);
            webView.addJavascriptInterface(androidPushBridge, "AndroidPush");
            androidPushBridge.capturePushIntent(getIntent());

            androidLocalRuntimeBridge = new AndroidLocalRuntimeBridge(this, webView);
            webView.addJavascriptInterface(androidLocalRuntimeBridge, "AndroidLocalRuntime");
            androidLocalRuntimeBridge.dispatchPendingSignals();
            Log.i(TAG, "Native Android push + Local-first bridges enabled");
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (androidPushBridge != null) androidPushBridge.capturePushIntent(intent);
        if (androidLocalRuntimeBridge != null) androidLocalRuntimeBridge.dispatchPendingSignals();
    }

    @Override
    public void onResume() {
        super.onResume();
        if (androidPushBridge != null) androidPushBridge.refreshRegistration();
        if (androidLocalRuntimeBridge != null) androidLocalRuntimeBridge.dispatchPendingSignals();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != AndroidPushBridge.NOTIFICATION_PERMISSION_REQUEST_CODE || androidPushBridge == null) return;
        boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        androidPushBridge.onPermissionResult(granted);
    }
}