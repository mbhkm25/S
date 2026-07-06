package com.sanadflow.verify;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "SANAD_ShareIntent";
    private static String sharedDataJson = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Register JS interface
        WebView webView = this.bridge.getWebView();
        if (webView != null) {
            webView.addJavascriptInterface(new AndroidShareInterface(), "AndroidShare");
            Log.d(TAG, "AndroidShare JavaScript Interface added");
        }

        // Handle cold start intent
        Intent intent = getIntent();
        if (intent != null) {
            handleShareIntent(intent, false);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent != null) {
            handleShareIntent(intent, true);
        }
    }

    private void handleShareIntent(Intent intent, boolean isHotStart) {
        String action = intent.getAction();
        String type = intent.getType();

        if (Intent.ACTION_SEND.equals(action) && type != null) {
            Uri fileUri = (Uri) intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (fileUri != null) {
                processUri(fileUri, type, isHotStart);
            }
        }
    }

    private void processUri(Uri uri, String mimeType, boolean isHotStart) {
        try {
            // Get file name
            String name = "shared_file";
            Cursor cursor = getContentResolver().query(uri, null, null, null, null);
            if (cursor != null) {
                int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (nameIndex != -1 && cursor.moveToFirst()) {
                    name = cursor.getString(nameIndex);
                }
                cursor.close();
            }

            // Fallback extension if missing in name
            if (name.equals("shared_file")) {
                if (mimeType.contains("pdf")) {
                    name = "shared_file.pdf";
                } else if (mimeType.contains("image")) {
                    String ext = mimeType.substring(mimeType.lastIndexOf("/") + 1);
                    name = "shared_file." + ext;
                }
            }

            // Read bytes and encode as Base64
            InputStream inputStream = getContentResolver().openInputStream(uri);
            if (inputStream == null) {
                Log.e(TAG, "Could not open input stream for Uri: " + uri.toString());
                return;
            }

            ByteArrayOutputStream byteBuffer = new ByteArrayOutputStream();
            int bufferSize = 4096;
            byte[] buffer = new byte[bufferSize];
            int len;
            while ((len = inputStream.read(buffer)) != -1) {
                byteBuffer.write(buffer, 0, len);
            }
            byte[] bytes = byteBuffer.toByteArray();
            inputStream.close();

            String base64Data = Base64.encodeToString(bytes, Base64.NO_WRAP);

            // Build JSON object
            JSONObject json = new JSONObject();
            json.put("name", name);
            json.put("mimeType", mimeType);
            json.put("base64", base64Data);

            sharedDataJson = json.toString();
            Log.d(TAG, "Processed shared file successfully: " + name + " (" + mimeType + ")");

            if (isHotStart) {
                // Trigger event in WebView
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        WebView webView = bridge.getWebView();
                        if (webView != null) {
                            webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('androidShareReceived'))", null);
                            Log.d(TAG, "Dispatched androidShareReceived event to WebView");
                        }
                    }
                });
            }
        } catch (Exception e) {
            Log.e(TAG, "Error processing shared Uri: " + e.getMessage(), e);
        }
    }

    // JS Bridge class
    public class AndroidShareInterface {
        @JavascriptInterface
        public String getSharedData() {
            Log.d(TAG, "JS requested shared data");
            return sharedDataJson;
        }

        @JavascriptInterface
        public void clearSharedData() {
            Log.d(TAG, "JS cleared shared data");
            sharedDataJson = null;
        }
    }
}
