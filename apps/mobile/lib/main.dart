import 'package:flutter/material.dart';
import 'theme/wireline_theme.dart';
import 'theme/wireline_tokens.generated.dart';

void main() {
  runApp(const BotBoundApp());
}

class BotBoundApp extends StatelessWidget {
  const BotBoundApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'BotBound',
      debugShowCheckedModeBanner: false,
      theme: WirelineTheme.darkTheme,
      home: const DashboardScreen(),
    );
  }
}

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Container(
              width: 10,
              height: 10,
              decoration: const BoxDecoration(
                color: WirelineDesignTokens.colorStatusSuccess,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 8),
            const Text(
              'BotBound',
              style: TextStyle(
                fontWeight: FontWeight.bold,
                letterSpacing: -0.5,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            key: const Key('dashboard_notifications_button'),
            icon: const Icon(Icons.notifications_none),
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('No unread dispatch notifications'),
                  duration: Duration(seconds: 2),
                ),
              );
            },
          ),
          IconButton(
            key: const Key('dashboard_settings_button'),
            icon: const Icon(Icons.settings_outlined),
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Settings: In-House Voice & Dispatch Active'),
                  duration: Duration(seconds: 2),
                ),
              );
            },
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(WirelineDesignTokens.space4),
        children: [
          // Voice Receptionist Status Card
          Container(
            padding: const EdgeInsets.all(WirelineDesignTokens.space4),
            decoration: BoxDecoration(
              color: WirelineDesignTokens.colorSurfaceContainer,
              borderRadius: BorderRadius.circular(WirelineDesignTokens.radiusMedium),
              border: Border.all(color: WirelineDesignTokens.colorBorderDefault),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'AI Receptionist',
                      style: TextStyle(
                        color: WirelineDesignTokens.colorTextSecondary,
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: WirelineDesignTokens.colorFeedbackSuccessSurface,
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(color: WirelineDesignTokens.colorFeedbackSuccessBorder),
                      ),
                      child: const Row(
                        children: [
                          Icon(Icons.mic, size: 12, color: WirelineDesignTokens.colorStatusSuccess),
                          SizedBox(width: 4),
                          Text(
                            'Active',
                            style: TextStyle(
                              color: WirelineDesignTokens.colorStatusSuccess,
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                const Text(
                  'Connected to Toll-Free +1 (888) 555-0199',
                  style: TextStyle(
                    color: WirelineDesignTokens.colorTextPrimary,
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Voice: In-House Owner Clone (Sub-120ms)',
                  style: TextStyle(
                    color: WirelineDesignTokens.colorActionPrimaryDefault,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: WirelineDesignTokens.space4),

          // 4-Pillar SMB Metrics Row
          Row(
            children: [
              Expanded(
                child: buildMetricTile(
                  title: 'Calls Handled',
                  value: '142',
                  trend: '+18% today',
                  icon: Icons.phone_in_talk,
                ),
              ),
              const SizedBox(width: WirelineDesignTokens.space3),
              Expanded(
                child: buildMetricTile(
                  title: 'Leads Booked',
                  value: '38',
                  trend: '\$14,250 pipeline',
                  icon: Icons.calendar_today,
                ),
              ),
            ],
          ),
          const SizedBox(height: WirelineDesignTokens.space4),

          // Cloud Computer Takeover Alert Banner
          Material(
            color: Colors.transparent,
            child: InkWell(
              key: const Key('dashboard_dispatch_card'),
              borderRadius: BorderRadius.circular(WirelineDesignTokens.radiusMedium),
              onTap: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Cloud Dispatch: HouseCall Pro & ServiceTitan synced'),
                    duration: Duration(seconds: 2),
                  ),
                );
              },
              child: Container(
                padding: const EdgeInsets.all(WirelineDesignTokens.space4),
                decoration: BoxDecoration(
                  color: WirelineDesignTokens.colorSurfaceRaised,
                  borderRadius: BorderRadius.circular(WirelineDesignTokens.radiusMedium),
                  border: Border.all(color: WirelineDesignTokens.colorBorderDefault),
                ),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: WirelineDesignTokens.colorActionPrimaryContainer,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Icon(
                        Icons.laptop_chromebook,
                        color: WirelineDesignTokens.colorActionPrimaryDefault,
                      ),
                    ),
                    const SizedBox(width: 12),
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Cloud Dispatch Sync',
                            style: TextStyle(
                              color: WirelineDesignTokens.colorTextPrimary,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          Text(
                            'HouseCall Pro & ServiceTitan synced',
                            style: TextStyle(
                              color: WirelineDesignTokens.colorTextTertiary,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const Icon(
                      Icons.chevron_right,
                      color: WirelineDesignTokens.colorTextTertiary,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  static Widget buildMetricTile({
    required String title,
    required String value,
    required String trend,
    required IconData icon,
  }) {
    return Container(
      padding: const EdgeInsets.all(WirelineDesignTokens.space3),
      decoration: BoxDecoration(
        color: WirelineDesignTokens.colorSurfaceDefault,
        borderRadius: BorderRadius.circular(WirelineDesignTokens.radiusMedium),
        border: Border.all(color: WirelineDesignTokens.colorBorderDefault),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                title,
                style: const TextStyle(
                  color: WirelineDesignTokens.colorTextTertiary,
                  fontSize: 12,
                ),
              ),
              Icon(icon, size: 16, color: WirelineDesignTokens.colorActionPrimaryDefault),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            value,
            style: const TextStyle(
              color: WirelineDesignTokens.colorTextPrimary,
              fontSize: 22,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            trend,
            style: const TextStyle(
              color: WirelineDesignTokens.colorStatusSuccess,
              fontSize: 11,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}

/// Standalone widget preview for the SMB dashboard screen.
Widget dashboardScreenPreview() {
  return const MaterialApp(
    debugShowCheckedModeBanner: false,
    home: DashboardScreen(),
  );
}

/// Standalone preview for the SMB metric tile component.
Widget metricTilePreview() {
  return MaterialApp(
    debugShowCheckedModeBanner: false,
    home: Scaffold(
      backgroundColor: WirelineDesignTokens.colorCanvasDefault,
      body: Center(
        child: SizedBox(
          width: 200,
          child: DashboardScreen.buildMetricTile(
            title: 'Leads Booked',
            value: '38',
            trend: '\$14,250 pipeline',
            icon: Icons.calendar_today,
          ),
        ),
      ),
    ),
  );
}
