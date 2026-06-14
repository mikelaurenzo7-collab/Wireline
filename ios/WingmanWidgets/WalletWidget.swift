import SwiftUI
import WidgetKit

/// Credit-balance widget. Reads the App Group snapshot (no network in the
/// extension). Read-only by design — top-ups happen on the web (Stripe), so the
/// widget never touches Apple's IAP surface. Best on the Lock Screen.
struct WalletWidget: Widget {
    let kind = "WalletWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SnapshotProvider()) { entry in
            WalletView(snapshot: entry.snapshot)
                .widgetURL(URL(string: "wingman://wallet"))
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Wingman balance")
        .description("Your prepaid Wingman credit at a glance.")
        .supportedFamilies([.systemSmall, .accessoryRectangular, .accessoryInline, .accessoryCircular])
    }
}

private struct WalletView: View {
    @Environment(\.widgetFamily) private var family
    let snapshot: WingmanWidgetSnapshot

    /// Formatted balance, or "—" when signed out / unknown.
    private var amount: String {
        guard snapshot.signedIn, let usd = snapshot.balanceUsd else { return "—" }
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "USD"
        formatter.maximumFractionDigits = usd < 100 ? 2 : 0
        return formatter.string(from: NSNumber(value: usd)) ?? "$\(usd)"
    }

    var body: some View {
        switch family {
        case .accessoryInline:
            Label(amount, systemImage: "creditcard")
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                VStack(spacing: 0) {
                    Image(systemName: "creditcard.fill").font(.caption2)
                    Text(amount).font(.caption2.weight(.semibold)).minimumScaleFactor(0.6)
                }
            }
        case .accessoryRectangular:
            HStack(spacing: 6) {
                Image(systemName: "creditcard.fill")
                VStack(alignment: .leading, spacing: 1) {
                    Text("Wingman credit").font(.caption2).foregroundStyle(.secondary)
                    Text(amount).font(.headline)
                }
            }
        default:
            VStack(alignment: .leading, spacing: 4) {
                Image(systemName: "creditcard.fill")
                    .font(.title3)
                    .foregroundStyle(WidgetBrand.accent)
                Spacer()
                Text("Balance")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(amount)
                    .font(.system(size: 30, weight: .bold, design: .rounded))
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
