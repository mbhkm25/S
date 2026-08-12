package com.sanadflow.sanad_local

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.pdf.PdfRenderer
import android.media.ExifInterface
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.Build
import android.provider.OpenableColumns
import android.provider.Settings
import android.content.pm.PackageManager
import androidx.core.content.FileProvider
import com.googlecode.tesseract.android.TessBaseAPI
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.security.MessageDigest
import java.util.concurrent.Executors
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

class MainActivity : FlutterActivity() {
    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())
    private var pendingSharedFile: Map<String, Any?>? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        captureSharedIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        captureSharedIntent(intent)
    }

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
                        val response = recognize(imagePath)
                        mainHandler.post { result.success(response) }
                    } catch (error: Throwable) {
                        mainHandler.post {
                            result.error("ocr_failed", error.message ?: error.javaClass.simpleName, null)
                        }
                    }
                }
            }

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "sanad.local/platform")
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "consumeSharedFile" -> {
                        val shared = pendingSharedFile
                        pendingSharedFile = null
                        result.success(shared)
                    }
                    "renderPdfFirstPage" -> {
                        val pdfPath = call.argument<String>("pdfPath")
                        val outputPath = call.argument<String>("outputPath")
                        if (pdfPath.isNullOrBlank() || outputPath.isNullOrBlank()) {
                            result.error("pdf_invalid_argument", "pdfPath and outputPath are required", null)
                            return@setMethodCallHandler
                        }
                        executor.execute {
                            try {
                                val response = renderPdfFirstPage(pdfPath, outputPath)
                                mainHandler.post { result.success(response) }
                            } catch (error: Throwable) {
                                mainHandler.post {
                                    result.error("pdf_preview_failed", error.message ?: error.javaClass.simpleName, null)
                                }
                            }
                        }
                    }
                    "getAppInfo" -> {
                        val info = packageManager.getPackageInfo(packageName, 0)
                        val versionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                            info.longVersionCode
                        } else {
                            @Suppress("DEPRECATION") info.versionCode.toLong()
                        }
                        result.success(mapOf("versionCode" to versionCode, "versionName" to (info.versionName ?: "")))
                    }
                    "installVerifiedApk" -> {
                        val apkPath = call.argument<String>("apkPath")
                        if (apkPath.isNullOrBlank()) {
                            result.error("update_invalid_argument", "apkPath is required", null)
                            return@setMethodCallHandler
                        }
                        try {
                            result.success(installVerifiedApk(apkPath))
                        } catch (error: Throwable) {
                            result.error("update_verification_failed", error.message, null)
                        }
                    }
                    else -> result.notImplemented()
                }
            }
    }

    private fun installVerifiedApk(apkPath: String): Map<String, Any> {
        val apk = File(apkPath)
        if (!apk.isFile || apk.length() == 0L) throw SecurityException("update_file_missing")
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            PackageManager.GET_SIGNING_CERTIFICATES
        } else {
            @Suppress("DEPRECATION") PackageManager.GET_SIGNATURES
        }
        @Suppress("DEPRECATION")
        val archive = packageManager.getPackageArchiveInfo(apk.absolutePath, flags)
            ?: throw SecurityException("update_package_invalid")
        if (archive.packageName != packageName) throw SecurityException("update_package_name_mismatch")
        val installed = packageManager.getPackageInfo(packageName, flags)
        if (certificateDigests(archive) != certificateDigests(installed)) {
            throw SecurityException("update_signing_certificate_mismatch")
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !packageManager.canRequestPackageInstalls()) {
            startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
            return mapOf("permissionRequired" to true)
        }
        val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", apk)
        startActivity(Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        })
        return mapOf("installerOpened" to true)
    }

    private fun certificateDigests(info: android.content.pm.PackageInfo): Set<String> {
        val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val signingInfo = info.signingInfo ?: throw SecurityException("update_signing_info_missing")
            if (signingInfo.hasMultipleSigners()) signingInfo.apkContentsSigners else signingInfo.signingCertificateHistory
        } else {
            @Suppress("DEPRECATION") info.signatures
        }
        return signatures.map { signature ->
            MessageDigest.getInstance("SHA-256").digest(signature.toByteArray())
                .joinToString("") { "%02x".format(it) }
        }.toSet()
    }

    private fun recognize(imagePath: String): Map<String, Any> {
        val image = File(imagePath)
        if (!image.isFile || image.length() == 0L) throw IllegalArgumentException("ocr_image_missing")
        val decoded = BitmapFactory.decodeFile(image.absolutePath)
            ?: throw IllegalArgumentException("ocr_image_decode_failed")
        val source = applyExifOrientation(decoded, image.absolutePath)
        if (source !== decoded) decoded.recycle()
        val prepared = preprocessForOcr(source)
        if (prepared !== source) source.recycle()

        val root = File(filesDir, "tesseract")
        prepareLanguageData(root)
        try {
            val primary = recognizePass(prepared, root, TessBaseAPI.PageSegMode.PSM_AUTO)
            val passes = mutableListOf(primary)
            if (primary.confidence < 0.80) {
                passes += recognizePass(prepared, root, TessBaseAPI.PageSegMode.PSM_SINGLE_BLOCK)
                val corrected = rotateForOcr(prepared, -5f)
                try {
                    passes += recognizePass(corrected, root, TessBaseAPI.PageSegMode.PSM_SINGLE_COLUMN)
                } finally {
                    corrected.recycle()
                }
            }
            val text = passes.map { it.text.trim() }.filter { it.isNotEmpty() }.distinct().joinToString("\n")
            return mapOf(
                "text" to text,
                "confidence" to passes.maxOf { it.confidence },
                "width" to prepared.width,
                "height" to prepared.height,
                "passCount" to passes.size,
            )
        } finally {
            prepared.recycle()
        }
    }

    private data class OcrPass(val text: String, val confidence: Double)

    private fun recognizePass(bitmap: Bitmap, root: File, pageSegMode: Int): OcrPass {
        val tess = TessBaseAPI()
        try {
            if (!tess.init(root.absolutePath, "ara+eng")) throw IllegalStateException("tesseract_init_failed")
            tess.pageSegMode = pageSegMode
            tess.setVariable("preserve_interword_spaces", "1")
            tess.setImage(bitmap)
            return OcrPass(
                text = tess.getUTF8Text() ?: "",
                confidence = tess.meanConfidence().coerceIn(0, 100) / 100.0,
            )
        } finally {
            tess.recycle()
        }
    }

    private fun rotateForOcr(source: Bitmap, degrees: Float): Bitmap {
        val radians = Math.toRadians(abs(degrees).toDouble())
        val width = (source.width * cos(radians) + source.height * sin(radians)).roundToInt()
        val height = (source.height * cos(radians) + source.width * sin(radians)).roundToInt()
        val output = Bitmap.createBitmap(max(1, width), max(1, height), Bitmap.Config.ARGB_8888)
        val canvas = Canvas(output)
        canvas.drawColor(Color.WHITE)
        val matrix = Matrix().apply {
            postTranslate(-source.width / 2f, -source.height / 2f)
            postRotate(degrees)
            postTranslate(output.width / 2f, output.height / 2f)
        }
        canvas.drawBitmap(source, matrix, Paint(Paint.ANTI_ALIAS_FLAG).apply { isFilterBitmap = true })
        return output
    }

    private fun applyExifOrientation(source: Bitmap, imagePath: String): Bitmap {
        val orientation = try {
            ExifInterface(imagePath).getAttributeInt(
                ExifInterface.TAG_ORIENTATION,
                ExifInterface.ORIENTATION_NORMAL,
            )
        } catch (_: Throwable) {
            ExifInterface.ORIENTATION_NORMAL
        }
        if (orientation == ExifInterface.ORIENTATION_NORMAL || orientation == ExifInterface.ORIENTATION_UNDEFINED) {
            return source
        }
        val matrix = Matrix().apply {
            when (orientation) {
                ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> setScale(-1f, 1f)
                ExifInterface.ORIENTATION_ROTATE_180 -> setRotate(180f)
                ExifInterface.ORIENTATION_FLIP_VERTICAL -> setScale(1f, -1f)
                ExifInterface.ORIENTATION_TRANSPOSE -> {
                    setRotate(90f)
                    postScale(-1f, 1f)
                }
                ExifInterface.ORIENTATION_ROTATE_90 -> setRotate(90f)
                ExifInterface.ORIENTATION_TRANSVERSE -> {
                    setRotate(270f)
                    postScale(-1f, 1f)
                }
                ExifInterface.ORIENTATION_ROTATE_270 -> setRotate(270f)
            }
        }
        return Bitmap.createBitmap(source, 0, 0, source.width, source.height, matrix, true)
    }

    private fun preprocessForOcr(source: Bitmap): Bitmap {
        val longest = max(source.width, source.height)
        val scale = when {
            longest < 1500 -> min(2.0, 2400.0 / longest)
            longest > 3200 -> 3200.0 / longest
            else -> 1.0
        }
        val width = max(1, (source.width * scale).roundToInt())
        val height = max(1, (source.height * scale).roundToInt())
        val scaled = if (width == source.width && height == source.height) source
            else Bitmap.createScaledBitmap(source, width, height, true)
        val output = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(output)
        canvas.drawColor(Color.WHITE)
        val matrix = ColorMatrix().apply { setSaturation(0f) }
        val contrast = 1.28f
        val translate = (-0.5f * contrast + 0.5f) * 255f
        matrix.postConcat(
            ColorMatrix(
                floatArrayOf(
                    contrast, 0f, 0f, 0f, translate,
                    0f, contrast, 0f, 0f, translate,
                    0f, 0f, contrast, 0f, translate,
                    0f, 0f, 0f, 1f, 0f,
                )
            )
        )
        canvas.drawBitmap(scaled, 0f, 0f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            colorFilter = ColorMatrixColorFilter(matrix)
            isFilterBitmap = true
        })
        if (scaled !== source) scaled.recycle()
        return output
    }

    private fun renderPdfFirstPage(pdfPath: String, outputPath: String): Map<String, Any> {
        val source = File(pdfPath)
        if (!source.isFile || source.length() == 0L) throw IllegalArgumentException("pdf_file_missing")
        val descriptor = android.os.ParcelFileDescriptor.open(source, android.os.ParcelFileDescriptor.MODE_READ_ONLY)
        PdfRenderer(descriptor).use { renderer ->
            if (renderer.pageCount < 1) throw IllegalArgumentException("pdf_has_no_pages")
            renderer.openPage(0).use { page ->
                val scale = min(3.0, 2200.0 / max(page.width, page.height))
                val bitmap = Bitmap.createBitmap(
                    max(1, (page.width * scale).roundToInt()),
                    max(1, (page.height * scale).roundToInt()),
                    Bitmap.Config.ARGB_8888,
                )
                Canvas(bitmap).drawColor(Color.WHITE)
                page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                val output = File(outputPath)
                output.parentFile?.mkdirs()
                FileOutputStream(output).use { stream ->
                    if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)) {
                        throw IllegalStateException("pdf_preview_write_failed")
                    }
                }
                bitmap.recycle()
                return mapOf("previewPath" to output.absolutePath, "pageCount" to renderer.pageCount)
            }
        }
    }

    private fun captureSharedIntent(sharedIntent: Intent?) {
        if (sharedIntent?.action != Intent.ACTION_SEND) return
        val uri = sharedIntent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM) ?: return
        val mimeType = sharedIntent.type ?: contentResolver.getType(uri) ?: return
        if (mimeType != "application/pdf" && !mimeType.startsWith("image/")) return
        try {
            val originalName = displayName(uri) ?: "shared-${System.currentTimeMillis()}${extensionFor(mimeType)}"
            val safeName = originalName.replace(Regex("[^A-Za-z0-9._-]"), "_")
            val extension = File(safeName).extension.lowercase()
            if (extension !in setOf("jpg", "jpeg", "png", "webp", "pdf")) return
            val target = File(cacheDir, "sanad-shared-${System.currentTimeMillis()}.$extension")
            contentResolver.openInputStream(uri).use { input ->
                if (input == null) throw IllegalArgumentException("shared_file_unreadable")
                FileOutputStream(target).use { output -> input.copyTo(output) }
            }
            pendingSharedFile = mapOf(
                "path" to target.absolutePath,
                "name" to originalName,
                "mimeType" to mimeType,
            )
        } catch (_: Throwable) {
            pendingSharedFile = null
        }
    }

    private fun displayName(uri: Uri): String? {
        contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null).use { cursor ->
            if (cursor != null && cursor.moveToFirst()) {
                val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (index >= 0) return cursor.getString(index)
            }
        }
        return null
    }

    private fun extensionFor(mimeType: String): String = when (mimeType) {
        "application/pdf" -> ".pdf"
        "image/png" -> ".png"
        "image/webp" -> ".webp"
        else -> ".jpg"
    }

    private fun prepareLanguageData(root: File) {
        val dataDir = File(root, "tessdata")
        if (!dataDir.exists() && !dataDir.mkdirs()) throw IllegalStateException("tessdata_directory_failed")
        listOf("ara", "eng").forEach { language ->
            val target = File(dataDir, "$language.traineddata")
            if (target.exists() && target.length() > 0L) return@forEach
            assets.open("flutter_assets/assets/tessdata/$language.traineddata").use { input: InputStream ->
                FileOutputStream(target).use { output -> input.copyTo(output) }
            }
            if (!target.isFile || target.length() == 0L) throw IllegalStateException("tessdata_copy_failed_$language")
        }
    }

    override fun onDestroy() {
        executor.shutdownNow()
        super.onDestroy()
    }
}
