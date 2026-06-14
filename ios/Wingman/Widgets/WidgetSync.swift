import Foundation
import WidgetKit

/// App-side bridge that refreshes the App Group snapshot the widgets read, then
/// asks WidgetKit to reload timelines. This runs in the APP (the widget
/// extension has no auth/network). Call `refresh()` on launch, on foreground,
/// and whenever sign-in state or call data changes.
enum WidgetSync {
    /// Pulls the small set of fields the widgets surface and writes the
    /// snapshot. Best-effort: a failed fetch leaves the previous snapshot in
    /// place rather than blanking the widget.
    static func refresh(signedIn: Bool) async {
        guard signedIn else {
            // Sign-out tears down any in-call Live Activity too.
            await CallActivityController.shared.end()
            WingmanWidgetStore.save(WingmanWidgetSnapshot(signedIn: false))
            WidgetCenter.shared.reloadAllTimelines()
            return
        }

        async let recentTask = try? await WingmanAPI.shared.recentCalls(limit: 6)
        async let walletTask = try? await WingmanAPI.shared.wallet()
        async let activeTask = try? await WingmanAPI.shared.activeCalls()
        async let agentsTask = try? await WingmanAPI.shared.agents()
        let (recent, wallet, active, agents) = await (recentTask, walletTask, activeTask, agentsTask)

        // Drive the in-call Live Activity off the same poll: start/update/end it
        // to match the current active call (no-ops if Live Activities are off).
        // Skipped only when the active-calls fetch itself failed (nil), so a
        // transient error never tears down a live call's activity.
        if let active {
            let liveCall = active.first
            let agentName = liveCall.flatMap { call in
                agents?.first(where: { $0.id == call.agentId })?.name
            } ?? "Wingman"
            await CallActivityController.shared.reconcile(call: liveCall, agentName: agentName)
        }

        // Nothing came back at all — keep whatever the widget already shows.
        if recent == nil, wallet == nil, active == nil { return }

        let calls: [WingmanWidgetCall] = (recent?.calls ?? []).prefix(6).map { call in
            WingmanWidgetCall(
                id: call.id,
                title: title(for: call),
                subtitle: subtitle(for: call),
                direction: call.direction,
                sentiment: call.sentiment,
                needsFollowUp: (call.outcomeTag ?? "").lowercased().contains("follow"),
                number: call.customerNumber
            )
        }

        let snapshot = WingmanWidgetSnapshot(
            recentCalls: calls,
            needsAttention: recent?.needsAttention ?? 0,
            activeCallLabel: active?.first.flatMap { $0.label ?? $0.customerNumber },
            balanceUsd: wallet?.balanceUsd,
            signedIn: true,
            updatedAt: Date()
        )
        WingmanWidgetStore.save(snapshot)
        WidgetCenter.shared.reloadAllTimelines()
    }

    // MARK: - Formatting (kept app-side so the widget stays a dumb renderer)

    private static func title(for call: RecentCall) -> String {
        if let number = call.customerNumber, !number.isEmpty { return number }
        return call.intentLabel ?? "Call"
    }

    private static func subtitle(for call: RecentCall) -> String {
        var parts: [String] = []
        if let outcome = call.outcomeTag, !outcome.isEmpty {
            parts.append(outcome)
        } else if let summary = call.summary, !summary.isEmpty {
            parts.append(String(summary.prefix(40)))
        }
        if let when = relativeTime(call.createdAt) { parts.append(when) }
        return parts.joined(separator: " · ")
    }

    private static func relativeTime(_ iso: String?) -> String? {
        guard let iso, let date = ISO8601DateFormatter().date(from: iso) else { return nil }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}
