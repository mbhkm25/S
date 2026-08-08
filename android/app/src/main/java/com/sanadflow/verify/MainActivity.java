package com.sanadflow.verify;

import android.Manifest;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
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
import java.io.File;
import java.io.InputStream;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "SANAD_Android";
    private static final int PAYMENT_CAMERA_REQUEST_CODE = 9410;
    private static final int PAYMENT_CAMERA_PERMISSION_REQUEST_CODE = 9411;

    private static String sharedDataJson = null;
    private static String capturedPaymentJson = null;

    private boolean qrScanInProgress = false;
    private boolean paymentCaptureInProgress = false;
    private Uri pendingPaymentCaptureUri = null;
    private String pendingPaymentCaptureName = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView webView = this.bridge.getWebView();
        if (webView != null) {
            webView.addJavascriptInterface(new AndroidShareInterface(), "AndroidShare");
            webView.addJavascriptInterface(new AndroidQrScannerInterface(), "AndroidQrScanner");
            webView.addJavascriptInterface(new AndroidPaymentCaptureInterface(), "AndroidPaymentCapture");
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

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode != PAYMENT_CAMERA_REQUEST_CODE) return;

        paymentCaptureInProgress = false;
        if (resultCode != Activity.RESULT_OK || pendingPaymentCaptureUri == null) {
            removePendingPaymentCapture();
            publishPaymentCaptureResult("cancelled", null, null, null, false, null);
            return;
        }

        finalizePendingPaymentCapture();
        processPaymentCaptureUri(pendingPaymentCaptureUri, pendingPaymentCaptureName);
        pendingPaymentCaptureUri = null;
        pendingPaymentCaptureName = null;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode != PAYMENT_CAMERA_PERMISSION_REQUEST_CODE) return;

        boolean granted = grantResults.length > 0;
        for (int result : grantResults) {
            if (result != PackageManager.PERMISSION_GRANTED) {
                granted = false;
                break;
            }
        }

        if (!granted) {
            paymentCaptureInProgress = false;
            publishPaymentCaptureResult(
                "error",
                null,
                null,
                null,
                false,
                "يحتاج سند إلى إذن الكاميرا لحفظ صورة الإشعار والتعامل معها."
            );
            return;
        }

        launchPaymentCapture();
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

    private void beginPaymentCapture() {
        if (paymentCaptureInProgress) return;
        paymentCaptureInProgress = true;

        List<String> missingPermissions = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
            && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            missingPermissions.add(Manifest.permission.CAMERA);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
            && Build.VERSION.SDK_INT <= Build.VERSION_CODES.P
            && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            missingPermissions.add(Manifest.permission.WRITE_EXTERNAL_STORAGE);
        }

        if (!missingPermissions.isEmpty()) {
            requestPermissions(
                missingPermissions.toArray(new String[0]),
                PAYMENT_CAMERA_PERMISSION_REQUEST_CODE
            );
            return;
        }

        launchPaymentCapture();
    }

    private void launchPaymentCapture() {
        try {
            removePendingPaymentCapture();

            pendingPaymentCaptureName = "SANAD_" + new SimpleDateFormat(
                "yyyyMMdd_HHmmss",
                Locale.US
            ).format(new Date()) + ".jpg";

            ContentValues values = new ContentValues();
            values.put(MediaStore.Images.Media.DISPLAY_NAME, pendingPaymentCaptureName);
            values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                values.put(
                    MediaStore.Images.Media.RELATIVE_PATH,
                    Environment.DIRECTORY_PICTURES + File.separator + "SANAD"
                );
                values.put(MediaStore.Images.Media.IS_PENDING, 1);
            } else {
                File directory = new File(
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES),
                    "SANAD"
                );
                if (!directory.exists() && !directory.mkdirs()) {
                    throw new IllegalStateException("Could not create SANAD gallery directory");
                }
                values.put(
                    MediaStore.Images.Media.DATA,
                    new File(directory, pendingPaymentCaptureName).getAbsolutePath()
                );
            }

            pendingPaymentCaptureUri = getContentResolver().insert(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                values
            );
            if (pendingPaymentCaptureUri == null) {
                throw new IllegalStateException("Could not create gallery destination");
            }

            Intent cameraIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            // Prefer the rear-facing camera every time SANAD starts a payment capture.
            // Camera apps from different Android vendors honor different extras, so send
            // the common legacy and modern hints together while keeping camera switching available.
            cameraIntent.putExtra("android.intent.extras.CAMERA_FACING", 0);
            cameraIntent.putExtra("android.intent.extra.USE_FRONT_CAMERA", false);
            cameraIntent.putExtra("android.intent.extras.LENS_FACING", 1);
            cameraIntent.putExtra(MediaStore.EXTRA_OUTPUT, pendingPaymentCaptureUri);
            cameraIntent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);

            if (cameraIntent.resolveActivity(getPackageManager()) == null) {
                throw new IllegalStateException("No camera application available");
            }

            startActivityForResult(cameraIntent, PAYMENT_CAMERA_REQUEST_CODE);
        } catch (Exception e) {
            Log.e(TAG, "Could not start payment capture", e);
            paymentCaptureInProgress = false;
            removePendingPaymentCapture();
            publishPaymentCaptureResult(
                "error",
                null,
                null,
                null,
                false,
                "تعذر فتح الكاميرا الآن. حاول مرة أخرى."
            );
        }
    }

    private void finalizePendingPaymentCapture() {
        if (pendingPaymentCaptureUri == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return;
        try {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Images.Media.IS_PENDING, 0);
            getContentResolver().update(pendingPaymentCaptureUri, values, null, null);
        } catch (Exception e) {
            Log.w(TAG, "Could not finalize gallery image", e);
        }
    }

    private void removePendingPaymentCapture() {
        if (pendingPaymentCaptureUri != null) {
            try {
                getContentResolver().delete(pendingPaymentCaptureUri, null, null);
            } catch (Exception e) {
                Log.w(TAG, "Could not remove pending payment capture", e);
            }
        }
        pendingPaymentCaptureUri = null;
        pendingPaymentCaptureName = null;
    }

    private void processPaymentCaptureUri(Uri uri, String name) {
        try {
            InputStream inputStream = getContentResolver().openInputStream(uri);
            if (inputStream == null) {
                throw new IllegalStateException("Could not read captured payment image");
            }

            ByteArrayOutputStream byteBuffer = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int len;
            while ((len = inputStream.read(buffer)) != -1) {
                byteBuffer.write(buffer, 0, len);
            }
            inputStream.close();

            String base64Data = Base64.encodeToString(byteBuffer.toByteArray(), Base64.NO_WRAP);
            publishPaymentCaptureResult(
                "success",
                name == null ? "SANAD_payment.jpg" : name,
                "image/jpeg",
                base64Data,
                true,
                null
            );
        } catch (Exception e) {
            Log.e(TAG, "Captured image was saved but could not be passed to SANAD", e);
            publishPaymentCaptureResult(
                "error",
                name,
                "image/jpeg",
                null,
                true,
                "تم حفظ الصورة في الاستوديو، لكن تعذر إرسالها إلى سند. أعد المحاولة من الاستوديو."
            );
        }
    }

    private void publishPaymentCaptureResult(
        String status,
        String name,
        String mimeType,
        String base64Data,
        boolean gallerySaved,
        String message
    ) {
        try {
            JSONObject json = new JSONObject();
            json.put("status", status);
            json.put("gallerySaved", gallerySaved);
            if (name != null) json.put("name", name);
            if (mimeType != null) json.put("mimeType", mimeType);
            if (base64Data != null) json.put("base64", base64Data);
            if (message != null) json.put("message", message);
            capturedPaymentJson = json.toString();
        } catch (Exception e) {
            Log.e(TAG, "Could not serialize payment capture result", e);
            capturedPaymentJson = null;
        }

        runOnUiThread(() -> {
            WebView webView = bridge.getWebView();
            if (webView != null) {
                webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('sanadNativePaymentCaptureReady'))",
                    null
                );
            }
        });
    }

    public class AndroidQrScannerInterface {
        @JavascriptInterface
        public void startScan() {
            runOnUiThread(() -> startNativeQrScan());
        }
    }

    public class AndroidPaymentCaptureInterface {
        @JavascriptInterface
        public void startCapture() {
            runOnUiThread(() -> beginPaymentCapture());
        }

        @JavascriptInterface
        public String getCapturedData() {
            return capturedPaymentJson;
        }

        @JavascriptInterface
        public void clearCapturedData() {
            capturedPaymentJson = null;
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
