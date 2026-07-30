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
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.CommonStatusCodes;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanner;
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "SANAD_Android";
    private static String sharedDataJson = null;
    private boolean qrScanInProgress = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView webView = this.bridge.getWebView();
        if (webView != null) {
            webView.addJavascriptInterface(new AndroidShareInterface(), "AndroidShare");
            webView.addJavascriptInterface(new AndroidQrScannerInterface(), "AndroidQrScanner");
            Log.d(TAG, "SANAD Android JavaScript interfaces added");
        }

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
            String name = "shared_file";
            Cursor cursor = getContentResolver().query(uri, null, null, null, null);
            if (cursor != null) {
                int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (nameIndex != -1 && cursor.moveToFirst()) {
                    name = cursor.getString(nameIndex);
                }
                cursor.close();
            }

            if (name.equals("shared_file")) {
                if (mimeType.contains("pdf")) {
                    name = "shared_file.pdf";
                } else if (mimeType.contains("image")) {
                    String ext = mimeType.substring(mimeType.lastIndexOf("/") + 1);
                    name = "shared_file." + ext;
                }
            }

            InputStream inputStream = getContentResolver().openInputStream(uri);
            if (inputStream == null) {
                Log.e(TAG, "Could not open input stream for Uri: " + uri);
                return;
            }

            ByteArrayOutputStream byteBuffer = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int len;
            while ((len = inputStream.read(buffer)) != -1) {
                byteBuffer.write(buffer, 0, len);
            }
            byte[] bytes = byteBuffer.toByteArray();
            inputStream.close();

            String base64Data = Base64.encodeToString(bytes, Base64.NO_WRAP);
            JSONObject json = new JSONObject();
            json.put("name", name);
            json.put("mimeType", mimeType);
            json.put("base64", base64Data);

            sharedDataJson = json.toString();
            Log.d(TAG, "Processed shared file successfully: " + name + " (" + mimeType + ")");

            if (isHotStart) {
                runOnUiThread(() -> {
                    WebView currentWebView = bridge.getWebView();
                    if (currentWebView != null) {
                        currentWebView.evaluateJavascript(
                            "window.dispatchEvent(new CustomEvent('androidShareReceived'))",
                            null
                        );
                    }
                });
            }
        } catch (Exception e) {
            Log.e(TAG, "Error processing shared Uri: " + e.getMessage(), e);
        }
    }

    private void dispatchQrResult(String status, String value, String message) {
        runOnUiThread(() -> {
            try {
                JSONObject payload = new JSONObject();
                payload.put("status", status);
                if (value != null) payload.put("value", value);
                if (message != null) payload.put("message", message);

                WebView webView = bridge.getWebView();
                if (webView != null) {
                    String encoded = JSONObject.quote(payload.toString());
                    String script = "window.dispatchEvent(new CustomEvent('sanadNativeQrResult',{detail:JSON.parse(" + encoded + ")}));";
                    webView.evaluateJavascript(script, null);
                }
            } catch (Exception e) {
                Log.e(TAG, "Could not dispatch QR result", e);
            }
        });
    }

    private void startNativeQrScan() {
        if (qrScanInProgress) return;
        qrScanInProgress = true;

        GmsBarcodeScannerOptions options = new GmsBarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .enableAutoZoom()
            .build();

        GmsBarcodeScanner scanner = GmsBarcodeScanning.getClient(this, options);
        scanner.startScan()
            .addOnSuccessListener(barcode -> {
                qrScanInProgress = false;
                String rawValue = barcode.getRawValue();
                if (rawValue == null || rawValue.trim().isEmpty()) {
                    dispatchQrResult("error", null, "لم يتم العثور على قيمة داخل رمز QR.");
                    return;
                }
                dispatchQrResult("success", rawValue, null);
            })
            .addOnCanceledListener(() -> {
                qrScanInProgress = false;
                dispatchQrResult("cancelled", null, null);
            })
            .addOnFailureListener(error -> {
                qrScanInProgress = false;
                if (error instanceof ApiException
                    && ((ApiException) error).getStatusCode() == CommonStatusCodes.CANCELED) {
                    dispatchQrResult("cancelled", null, null);
                    return;
                }
                Log.e(TAG, "Native QR scanner failed", error);
                dispatchQrResult("error", null, "تعذر تشغيل ماسح Android الأصلي.");
            });
    }

    public class AndroidQrScannerInterface {
        @JavascriptInterface
        public void startScan() {
            runOnUiThread(() -> startNativeQrScan());
        }
    }

    public class AndroidShareInterface {
        @JavascriptInterface
        public String getSharedData() {
            return sharedDataJson;
        }

        @JavascriptInterface
        public void clearSharedData() {
            sharedDataJson = null;
        }
    }
}
