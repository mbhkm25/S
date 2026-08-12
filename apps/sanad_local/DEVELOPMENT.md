# SANAD Local — live development on a physical Android phone

The development loop uses `flutter run`; it does not build or reinstall a release APK after every edit.

## One-time laptop setup

1. Install Flutter stable, Android Studio/Android SDK, Platform Tools (`adb`), JDK 17, and Python 3.
2. Run `flutter doctor` and resolve Android toolchain errors.
3. From `apps/sanad_local`, run:

   ```bash
   bash tool/bootstrap_android.sh
   ```

## Connect the phone by USB

1. Enable Developer options by tapping **Build number** seven times.
2. Enable **USB debugging**.
3. Connect with a data-capable USB cable and accept the RSA authorization dialog on the phone.
4. Verify the connection:

   ```bash
   adb devices
   flutter devices
   ```

5. Start the app from `apps/sanad_local`:

   ```bash
   bash tool/run_on_device.sh
   ```

If more than one device is connected, pass the ID printed by `flutter devices`:

```bash
bash tool/run_on_device.sh R58XXXXXXXX
```

While Flutter is running, press `r` for Hot Reload, `R` for Hot Restart, and `q` to stop. Dart UI and financial-rule changes normally support Hot Reload. Kotlin, Android manifest, plugin, and bundled-asset changes require stopping and running the command again.

## Wireless debugging (Android 11+)

Pair the laptop and phone on the same trusted Wi-Fi network from **Developer options → Wireless debugging**:

```bash
adb pair PHONE_IP:PAIRING_PORT
adb connect PHONE_IP:DEBUG_PORT
bash tool/run_on_device.sh PHONE_IP:DEBUG_PORT
```

Use USB for camera/OCR acceptance and performance measurements because it is more stable. Keep original financial files on the phone; this workflow does not upload images.
