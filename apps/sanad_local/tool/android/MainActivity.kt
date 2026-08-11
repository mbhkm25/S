package com.sanadflow.sanad_local

import android.os.Handler
import android.os.Looper
import com.googlecode.tesseract.android.TessBaseAPI
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors

class MainActivity : FlutterActivity() {
    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "sanad.local/ocr")
            .setMethodCallHandler { call, result ->
                if (call.method != "recognize") {
                    result.notImplemented()
                    return@setMethodCallHandler
                }

                val imagePath = call.argument<String>("imagePath")
                if (imagePath.isNullOrBlank()) {
                    result.error("ocr_invalid_argument", "imagePath is required", null)
                    return@setMethodCallHandler
                }

                executor.execute {
                    try {
                        val text = recognize(imagePath)
                        mainHandler.post { result.success(text) }
                    } catch (error: Throwable) {
                        mainHandler.post {
                            result.error("ocr_failed", error.message ?: error.javaClass.simpleName, null)
                        }
                    }
                }
            }
    }

    private fun recognize(imagePath: String): String {
        val image = File(imagePath)
        if (!image.isFile || image.length() == 0L) {
            throw IllegalArgumentException("ocr_image_missing")
        }

        val root = File(filesDir, "tesseract")
        prepareLanguageData(root)
        val tess = TessBaseAPI()
        try {
            if (!tess.init(root.absolutePath, "ara+eng")) {
                throw IllegalStateException("tesseract_init_failed")
            }
            tess.setImage(image)
            return tess.getUTF8Text() ?: ""
        } finally {
            tess.recycle()
        }
    }

    private fun prepareLanguageData(root: File) {
        val dataDir = File(root, "tessdata")
        if (!dataDir.exists() && !dataDir.mkdirs()) {
            throw IllegalStateException("tessdata_directory_failed")
        }

        listOf("ara", "eng").forEach { language ->
            val target = File(dataDir, "$language.traineddata")
            if (target.exists() && target.length() > 0L) return@forEach

            assets.open("flutter_assets/assets/tessdata/$language.traineddata").use { input ->
                FileOutputStream(target).use { output -> input.copyTo(output) }
            }

            if (!target.isFile || target.length() == 0L) {
                throw IllegalStateException("tessdata_copy_failed_$language")
            }
        }
    }

    override fun onDestroy() {
        executor.shutdownNow()
        super.onDestroy()
    }
}
