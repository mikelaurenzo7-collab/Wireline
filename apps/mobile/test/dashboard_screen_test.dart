import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:botbound_mobile/main.dart';
import 'package:botbound_mobile/theme/wireline_theme.dart';
import 'package:botbound_mobile/theme/wireline_tokens.generated.dart';

void main() {
  group('BotBound Mobile SMB Dashboard (3-Layer Test Suite)', () {
    // ------------------------------------------------------------------------
    // Layer 1: Static Hierarchy & Information Architecture
    // ------------------------------------------------------------------------
    testWidgets('Layer 1: renders all primary SMB cards, metrics, and labels', (WidgetTester tester) async {
      await tester.pumpWidget(const BotBoundApp());

      // Brand Title & Status
      expect(find.text('BotBound'), findsOneWidget);
      expect(find.text('Active'), findsOneWidget);

      // AI Receptionist & In-House Voice Status
      expect(find.text('AI Receptionist'), findsOneWidget);
      expect(find.text('Connected to Toll-Free +1 (888) 555-0199'), findsOneWidget);
      expect(find.text('Voice: In-House Owner Clone (Sub-120ms)'), findsOneWidget);

      // 4-Pillar Metrics
      expect(find.text('Calls Handled'), findsOneWidget);
      expect(find.text('142'), findsOneWidget);
      expect(find.text('+18% today'), findsOneWidget);

      expect(find.text('Leads Booked'), findsOneWidget);
      expect(find.text('38'), findsOneWidget);
      expect(find.text(r'$14,250 pipeline'), findsOneWidget);

      // Cloud Dispatch Sync Card
      expect(find.text('Cloud Dispatch Sync'), findsOneWidget);
      expect(find.text('HouseCall Pro & ServiceTitan synced'), findsOneWidget);
    });

    // ------------------------------------------------------------------------
    // Layer 2: Interactive Gestures & State Feedbacks
    // ------------------------------------------------------------------------
    testWidgets('Layer 2: handles tap interactions on notifications, settings, and dispatch', (WidgetTester tester) async {
      await tester.pumpWidget(const BotBoundApp());

      // 1. Tap notifications icon
      final notificationsBtn = find.byKey(const Key('dashboard_notifications_button'));
      expect(notificationsBtn, findsOneWidget);
      await tester.tap(notificationsBtn);
      await tester.pump();
      expect(find.text('No unread dispatch notifications'), findsOneWidget);

      // Settle snackbar
      await tester.pump(const Duration(seconds: 3));

      // 2. Tap settings icon
      final settingsBtn = find.byKey(const Key('dashboard_settings_button'));
      expect(settingsBtn, findsOneWidget);
      await tester.tap(settingsBtn);
      await tester.pump();
      expect(find.text('Settings: In-House Voice & Dispatch Active'), findsOneWidget);

      // Settle snackbar
      await tester.pump(const Duration(seconds: 3));

      // 3. Tap Cloud Dispatch Sync card
      final dispatchCard = find.byKey(const Key('dashboard_dispatch_card'));
      expect(dispatchCard, findsOneWidget);
      await tester.tap(dispatchCard);
      await tester.pump();
      expect(find.text('Cloud Dispatch: HouseCall Pro & ServiceTitan synced'), findsOneWidget);
    });

    // ------------------------------------------------------------------------
    // Layer 3: Visual Theme & Design Token Styling
    // ------------------------------------------------------------------------
    testWidgets('Layer 3: validates theme application and token visual values', (WidgetTester tester) async {
      await tester.pumpWidget(const BotBoundApp());

      // Check Material Theme configuration
      final materialApp = tester.widget<MaterialApp>(find.byType(MaterialApp));
      expect(materialApp.theme, equals(WirelineTheme.darkTheme));
      expect(materialApp.theme?.brightness, equals(Brightness.dark));
      expect(materialApp.theme?.scaffoldBackgroundColor, equals(WirelineDesignTokens.colorCanvasDefault));

      // Check Scaffold background matches token canvas
      final scaffold = tester.widget<Scaffold>(find.byType(Scaffold));
      expect(scaffold.backgroundColor, isNull); // Falls through to theme scaffoldBackgroundColor

      // Standalone Preview validation
      await tester.pumpWidget(dashboardScreenPreview());
      expect(find.byType(DashboardScreen), findsOneWidget);

      await tester.pumpWidget(metricTilePreview());
      expect(find.text('Leads Booked'), findsOneWidget);
      expect(find.text('38'), findsOneWidget);
    });
  });
}
