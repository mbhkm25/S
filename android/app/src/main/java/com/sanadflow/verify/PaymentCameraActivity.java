package com.sanadflow.verify;

import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageCapture;
import androidx.camera.core.ImageCaptureException;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;

import com.google.common.util.concurrent.ListenableFuture;

import java.io.File;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class PaymentCameraActivity extends AppCompatActivity {
    public static final String EXTRA_CAPTURE_URI = "sanad.capture_uri";
    public static final String EXTRA_CAPTURE_NAME = "sanad.capture_name";
    public static final String EXTRA_CAPTURE_ERROR = "sanad.capture_error";

    private PreviewView previewView;
    private ImageCapture imageCapture;
    private ExecutorService cameraExecutor;
    private Button captureButton;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        cameraExecutor = Executors.newSingleThreadExecutor();
        setContentView(buildCameraUi());
        startRearCamera();
    }

    private View buildCameraUi() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        previewView = new PreviewView(this);
        previewView.setImplementationMode(PreviewView.ImplementationMode.COMPATIBLE);
        root.addView(previewView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        TextView title = new TextView(this);
        title.setText("صوّر إشعار الدفع");
        title.setTextColor(Color.WHITE);
        title.setTextSize(18f);
        title.setGravity(Gravity.CENTER);
        title.setPadding(24, 22, 24, 22);
        title.setBackgroundColor(0x66000000);
        FrameLayout.LayoutParams titleParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.TOP
        );
        root.addView(title, titleParams);

        LinearLayout controls = new LinearLayout(this);
        controls.setOrientation(LinearLayout.HORIZONTAL);
        controls.setGravity(Gravity.CENTER);
        controls.setPadding(20, 18, 20, 28);
        controls.setBackgroundColor(0x66000000);

        Button cancelButton = new Button(this);
        cancelButton.setText("إلغاء");
        cancelButton.setOnClickListener(v -> {
            setResult(RESULT_CANCELED);
            finish();
        });

        captureButton = new Button(this);
        captureButton.setText("التقاط");
        captureButton.setEnabled(false);
        captureButton.setOnClickListener(v -> capturePaymentImage());

        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        buttonParams.setMargins(8, 0, 8, 0);
        controls.addView(cancelButton, buttonParams);
        controls.addView(captureButton, buttonParams);

        FrameLayout.LayoutParams controlsParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.BOTTOM
        );
        root.addView(controls, controlsParams);

        return root;
    }

    private void startRearCamera() {
        ListenableFuture<ProcessCameraProvider> cameraProviderFuture = ProcessCameraProvider.getInstance(this);
        cameraProviderFuture.addListener(() -> {
            try {
                ProcessCameraProvider cameraProvider = cameraProviderFuture.get();
                Preview preview = new Preview.Builder().build();
                preview.setSurfaceProvider(previewView.getSurfaceProvider());

                imageCapture = new ImageCapture.Builder()
                    .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                    .build();

                cameraProvider.unbindAll();
                cameraProvider.bindToLifecycle(
                    this,
                    CameraSelector.DEFAULT_BACK_CAMERA,
                    preview,
                    imageCapture
                );
                captureButton.setEnabled(true);
            } catch (Exception error) {
                finishWithError("تعذر تشغيل الكاميرا الخلفية على هذا الجهاز.");
            }
        }, ContextCompat.getMainExecutor(this));
    }

    private void capturePaymentImage() {
        if (imageCapture == null) return;
        captureButton.setEnabled(false);

        String fileName = "SANAD_" + new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date()) + ".jpg";
        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
        values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            values.put(
                MediaStore.Images.Media.RELATIVE_PATH,
                Environment.DIRECTORY_PICTURES + File.separator + "SANAD"
            );
        } else {
            File directory = new File(
                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES),
                "SANAD"
            );
            if (!directory.exists() && !directory.mkdirs()) {
                finishWithError("تعذر إنشاء مجلد سند في الاستوديو.");
                return;
            }
            values.put(
                MediaStore.Images.Media.DATA,
                new File(directory, fileName).getAbsolutePath()
            );
        }

        ImageCapture.OutputFileOptions outputOptions = new ImageCapture.OutputFileOptions.Builder(
            getContentResolver(),
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
            values
        ).build();

        imageCapture.takePicture(
            outputOptions,
            cameraExecutor,
            new ImageCapture.OnImageSavedCallback() {
                @Override
                public void onImageSaved(@NonNull ImageCapture.OutputFileResults outputFileResults) {
                    Uri savedUri = outputFileResults.getSavedUri();
                    if (savedUri == null) {
                        runOnUiThread(() -> finishWithError("تم التقاط الصورة لكن تعذر تحديد موقعها في الاستوديو."));
                        return;
                    }

                    Intent result = new Intent();
                    result.putExtra(EXTRA_CAPTURE_URI, savedUri.toString());
                    result.putExtra(EXTRA_CAPTURE_NAME, fileName);
                    runOnUiThread(() -> {
                        setResult(RESULT_OK, result);
                        finish();
                    });
                }

                @Override
                public void onError(@NonNull ImageCaptureException exception) {
                    runOnUiThread(() -> finishWithError("تعذر حفظ صورة الإشعار. حاول مرة أخرى."));
                }
            }
        );
    }

    private void finishWithError(String message) {
        Intent result = new Intent();
        result.putExtra(EXTRA_CAPTURE_ERROR, message);
        setResult(RESULT_FIRST_USER, result);
        finish();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (cameraExecutor != null) {
            cameraExecutor.shutdown();
        }
    }
}
