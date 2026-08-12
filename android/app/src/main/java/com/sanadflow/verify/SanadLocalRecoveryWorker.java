package com.sanadflow.verify;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

/**
 * Native recovery sentinel for the React Local-first runtime.
 *
 * The durable operation payload currently lives in the app WebView/IndexedDB.
 * Android WorkManager therefore must not attempt to mutate or upload that
 * payload behind React's repository/idempotency contract. Instead, this worker
 * records a durable recovery signal. The next foreground/resume cycle consumes
 * it and drains the canonical Local-first sync queue.
 */
public class SanadLocalRecoveryWorker extends Worker {
    static final String PREFS = "sanad_local_runtime";
    static final String KEY_RECOVERY_DUE = "recovery_due";
    static final String KEY_RECOVERY_AT = "recovery_due_at";

    public SanadLocalRecoveryWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        SharedPreferences prefs = getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit()
            .putBoolean(KEY_RECOVERY_DUE, true)
            .putLong(KEY_RECOVERY_AT, System.currentTimeMillis())
            .apply();
        return Result.success();
    }
}
