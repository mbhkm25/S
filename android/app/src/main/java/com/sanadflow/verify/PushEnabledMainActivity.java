package com.sanadflow.verify;

import android.content.pm.PackageManager;
import android.os.Bundle;
import android.util.Log;
import android.webkit.WebView;

public class PushEnabledMainActivity extends MainActivity {
    private static final String TAG = "SANAD_PushActivity";
    private AndroidPushBridge androidPushBridge;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = this.bridge == null ? null : this.bridge.getWebView();
        if (webView != null) {
            androidPushBridge = new AndroidPushBridge(this, webView);
            webView.addJavascriptInterface(androidPushBridge, "AndroidPush");
            Log.i(TAG, "Native Android push bridge enabled");
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        if (androidPushBridge != null) androidPushBridge.refreshRegistration();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != AndroidPushBridge.NOTIFICATION_PERMISSION_REQUEST_CODE || androidPushBridge == null) return;
        boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        androidPushBridge.onPermissionResult(granted);
    }
}
