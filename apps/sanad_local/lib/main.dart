import 'dart:async';

import 'package:flutter/material.dart';

import 'app.dart';
import 'data/local_database.dart';
import 'services/sanad_cloud.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  FlutterError.onError = (details) {
    FlutterError.presentError(details);
  };

  await initializeSanadCloud();
  await LocalDatabase.instance.database;
  await LocalDatabase.instance.recoverInterruptedJobs();

  runZonedGuarded(
    () => runApp(const SanadLocalApp()),
    (error, stack) {
      debugPrint('SANAD_LOCAL_UNCAUGHT: $error\n$stack');
    },
  );
}
