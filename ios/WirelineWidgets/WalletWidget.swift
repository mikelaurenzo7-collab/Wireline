import WidgetKit
import SwiftUI

/// Home Screen + Lock Screen widget showing wallet credit balance.
struct WalletWidget: Widget {
    let kind = "WalletWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            WalletWidgetView(balance: entry.balance, signedIn: entry.signedIn)
                .widgetURL(URL(string: "wireline://wallet"))
                .containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("Wallet Balance")
        .description("View your current Wireline credit balance at a glance.")
        .supportedFamilies([
            .systemSmall,
            .accessoryCircular,
            .accessoryRectangular,
            .accessoryInline,
        ])
    }

    struct Entry: TimelineEntry {
        let date: Date
        let balance: Double?
        let signedIn: Bool
    }

    struct Provider: TimelineProvider {
        func placeholder(in context: Context) -> Entry {
            Entry(date: .now, balance: 24.50, signedIn: true)
        }

        func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
            let snapshot = WirelineWidgetStore.load()
            completion(Entry(
                date: .now,
                balance: snapshot.balanceUsd,
                signedIn: snapshot.signedIn
            ))
        }

        func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
            let snapshot = WirelineWidgetStore.load()
            let entry = Entry(
                date: .now,
                balance: snapshot.balanceUsd,
                signedIn: snapshot.signedIn
            )
            let next = Calendar.current.date(byAdding: .minute, value: 15, to: .now) ?? .now
            completion(Timeline(entries: [entry], policy: .after(next)))
        }
    }
}

private struct WalletWidgetView: View {
    let balance: Double?
    let signedIn: Bool

    @Environment(\.widgetFamily) private var family

    private func formattedBalance(short: Bool = false) -> String {
        guard let balance = balance else { return "$0.00" }
        if short {
            if balance >= 1000 {
                return String(format: "$%.0fk", balance / 1000.0)
            }
            return String(format: "$%.0f", balance)
        }
        return String(format: "$%.2f", balance)
    }

    var body: some View {
        if !signedIn {
            signedOutView
        } else {
            switch family {
            case .accessoryInline:
                Label("Balance: \(formattedBalance())", systemImage: "creditcard")
            case .accessoryCircular:
                ZStack {
                    AccessoryWidgetBackground()
                    VStack(spacing: 1) {
                        Image(systemName: "creditcard.fill")
                            .font(.system(size: 12))
                        Text(formattedBalance(short: true))
                            .font(.system(size: 13, weight: .bold, design: .rounded))
                    }
                }
            case .accessoryRectangular:
                HStack(spacing: 8) {
                    Image(systemName: "creditcard.fill")
                        .font(.title2.weight(.semibold))
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Wallet Balance")
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(.secondary)
                        Text(formattedBalance())
                            .font(.headline.weight(.bold))
                    }
                }
            default:
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Image(systemName: "creditcard.fill")
                            .font(.title2.weight(.semibold))
                            .foregroundStyle(WidgetColors.accent)
                        Spacer()
                    }
                    Spacer()
                    Text(formattedBalance())
                        .font(.system(size: 32, weight: .heavy, design: .rounded))
                        .foregroundStyle(WidgetColors.text)
                        .minimumScaleFactor(0.7)
                        .lineLimit(1)
                    Text("available credits")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(WidgetColors.text2)
                }
                .padding(16)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                .background(WidgetColors.panel)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Wallet balance: \(formattedBalance()), available credits")
            }
        }
    }

    @ViewBuilder
    private var signedOutView: some View {
        switch family {
        case .accessoryInline:
            Text("Open Wireline to sign in")
        case .accessoryCircular:
            Image(systemName: "person.crop.circle.badge.questionmark")
                .font(.title2)
        case .accessoryRectangular:
            Text("Sign in to Wireline").font(.headline)
        default:
            VStack {
                Image(systemName: "person.crop.circle.badge.questionmark")
                    .font(.largeTitle)
                    .foregroundStyle(WidgetColors.text2)
                Text("Sign in to see balance")
                    .font(.caption)
                    .foregroundStyle(WidgetColors.text2)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(WidgetColors.panel)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Sign in to see balance")
        }
    }
}
