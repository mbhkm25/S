import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sanad_local/app.dart';
import 'package:sanad_local/services/sanad_cloud.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    SharedPreferences.setMockInitialValues(const {});
    await initializeSanadCloud();
  });

  testWidgets('SANAD Local renders cashier-first home', (tester) async {
    await tester.pumpWidget(const SanadLocalApp());
    await tester.pumpAndSettle();
    expect(find.text('سند المحلي'), findsOneWidget);
    expect(find.text('تصوير إشعار مالي'), findsOneWidget);
    expect(find.text('تقرير اليوم'), findsOneWidget);
  });
}
