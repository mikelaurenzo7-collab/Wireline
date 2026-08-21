import SwiftUI

/// Prepaid credit wallet — **read-only**. Credits are purchased on the web
/// (Stripe); the app never sells them in-app, which keeps Wireline clear of
/// Apple's In-App Purchase requirement. We show balance + recent movements and
/// point to the web to top up.
struct WalletView: View {
    @State private var wallet: WalletResponse?
    @State private var loadError: String?

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Credit balance").font(.caption).foregroundStyle(.secondary)
                    Text(money(wallet?.balanceUsd ?? 0)).font(.largeTitle.weight(.bold))
                }
                .padding(.vertical, 4)
            } footer: {
                Text("Credits cover voice-minute overage automatically. Add credits or manage billing at botbound.me.")
            }

            if let ledger = wallet?.ledger, !ledger.isEmpty {
                Section("Recent activity") {
                    ForEach(ledger) { entry in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(label(entry.reason)).font(.subheadline)
                                Text(money(entry.balanceAfterUsd) + " balance")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text(signed(entry.deltaUsd))
                                .font(.callout.weight(.semibold))
                                .foregroundStyle(entry.deltaUsd >= 0 ? Brand.signal : Brand.ink)
                        }
                    }
                }
            } else if loadError == nil {
                Section { Text("No credit activity yet.").foregroundStyle(.secondary) }
            }
        }
        .navigationTitle("Wallet")
        .navigationBarTitleDisplayMode(.inline)
        .wirelineBrand()
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do { wallet = try await WirelineAPI.shared.wallet(); loadError = nil }
        catch { loadError = error.localizedDescription }
    }

    private func money(_ usd: Double) -> String {
        String(format: "$%.2f", usd)
    }

    private func signed(_ usd: Double) -> String {
        (usd >= 0 ? "+" : "−") + String(format: "$%.2f", abs(usd))
    }

    private func label(_ reason: String) -> String {
        switch reason {
        case "voice_overage": return "Voice overage"
        case "web_topup": return "Added credit"
        default: return reason.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }
}
