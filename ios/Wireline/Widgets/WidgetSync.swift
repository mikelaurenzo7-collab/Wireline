import Foundation
import WidgetKit

/// Fetches mobile API data and writes a compact snapshot into the shared App
/// Group so home-screen widgets can render without their own auth or network.
enum WidgetSync {
    static func refresh() async {
        guard KeychainStore.loadToken() != nil else {
            saveSignedOut()
            return
        }
        do {
            async let walletTask = WirelineAPI.shared.wallet()
            async let recentTask = WirelineAPI.shared.recentCalls(limit: 5)
            async let activeTask = WirelineAPI.shared.activeCalls()

            let wallet = try await walletTask
            let recent = try await recentTask
            let active = try await activeTask

            let snapshot = buildSnapshot(wallet: wallet, recent: recent, active: active)
            WirelineWidgetStore.save(snapshot)
            await MainActor.run { WidgetCenter.shared.reloadAllTimelines() }
        } catch {
            // Keep the last good snapshot on transient network failures.
        }
    }

    static func saveSignedOut() {
        WirelineWidgetStore.save(WirelineWidgetSnapshot(signedIn: false, updatedAt: .now))
        Task { @MainActor in WidgetCenter.shared.reloadAllTimelines() }
    }

    private static func buildSnapshot(
        wallet: WalletResponse,
        recent: RecentCallsResponse,
        active: [ActiveCall]
    ) -> WirelineWidgetSnapshot {
        let calls = recent.calls.map { call in
            WirelineWidgetCall(
                id: call.id,
                title: call.customerNumber ?? "Unknown",
                subtitle: call.summary ?? call.intentLabel ?? "No recap yet",
                direction: call.direction,
                sentiment: call.sentiment,
                needsFollowUp: call.outcomeTag == "followup"
            )
        }
        let activeLabel = active.first.map { call in
            call.label ?? call.customerNumber ?? "Active call"
        }
        return WirelineWidgetSnapshot(
            recentCalls: calls,
            needsAttention: recent.needsAttention,
            activeCallLabel: activeLabel,
            balanceUsd: wallet.balanceUsd,
            signedIn: true,
            updatedAt: .now
        )
    }
}
