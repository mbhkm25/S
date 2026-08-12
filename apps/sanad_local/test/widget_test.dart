import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:sanad_local/app.dart';
import 'package:sanad_local/services/sanad_cloud.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
    SharedPreferences.setMockInitialValues(const {});
    await initializeSanadCloud();
  });

  testWidgets('SANAD Local renders cashier-first home', (tester) async {
    await tester.pumpWidget(const SanadLocalApp());
    await tester.pumpAndSettle();
    expect(find.text('دفتر العمليات المحلي'), findsOneWidget);
    expect(find.text('تصوير إشعار مالي'), findsOneWidget);
    expect(find.text('من الملفات'), findsOneWidget);
    expect(find.text('تقرير اليوم'), findsOneWidget);
  });
}
