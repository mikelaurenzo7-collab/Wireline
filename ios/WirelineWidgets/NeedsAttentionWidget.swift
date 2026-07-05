import WidgetKit
import SwiftUI

/// Lock Screen + Home Screen widget showing how many calls need follow-up.
struct NeedsAttentionWidget: Widget {
    let kind = "NeedsAttentionWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            NeedsAttentionWidgetView(count: entry.count, signedIn: entry.signedIn)
                .widgetURL(URL(string: "wireline://calls"))
                .containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("Needs Attention")
        .description("See how many calls need follow-up at a glance.")
        .supportedFamilies([
            .systemSmall,
            .accessoryCircular,
            .accessoryRectangular,
            .accessoryInline,
        ])
    }

    struct Entry: TimelineEntry {
        let date: Date
        let count: Int
        let signedIn: Bool
    }

    struct Provider: TimelineProvider {
        func placeholder(in context: Context) -> Entry {
            Entry(date: .now, count: 2, signedIn: true)
        }

        func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
            let snapshot = WirelineWidgetStore.load()
            completion(Entry(
                date: .now,
                count: snapshot.needsAttention,
                signedIn: snapshot.signedIn
            ))
        }

        func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
            let snapshot = WirelineWidgetStore.load()
            let entry = Entry(
                date: .now,
                count: snapshot.needsAttention,
                signedIn: snapshot.signedIn
            )
            let next = Calendar.current.date(byAdding: .minute, value: 15, to: .now) ?? .now
            completion(Timeline(entries: [entry], policy: .after(next)))
        }
    }
}

private struct NeedsAttentionWidgetView: View {
    let count: Int
    let signedIn: Bool

    @Environment(\.widgetFamily) private var family

    var body: some View {
        if !signedIn {
            signedOutView
        } else {
            switch family {
            case .accessoryInline:
                Label(
                    count == 0 ? "All caught up" : "\(count) need follow-up",
                    systemImage: count == 0 ? "checkmark.circle" : "bell.badge"
                )
            case .accessoryCircular:
                ZStack {
                    AccessoryWidgetBackground()
                    VStack(spacing: 1) {
                        Image(systemName: count == 0 ? "checkmark" : "bell.badge")
                            .font(.system(size: 14, weight: .bold))
                        Text("\(count)")
                            .font(.system(size: 16, weight: .heavy, design: .rounded))
                    }
                }
            case .accessoryRectangular:
                HStack(spacing: 10) {
                    Image(systemName: count == 0 ? "checkmark.circle.fill" : "bell.badge.fill")
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(count == 0 ? WidgetColors.accentSoft : WidgetColors.accent)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(count == 0 ? "All caught up" : "\(count) need attention")
                            .font(.headline.weight(.bold))
                        Text(count == 0 ? "No pending follow-ups" : "Calls need follow-up")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            default:
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Image(systemName: count == 0 ? "checkmark.circle.fill" : "bell.badge.fill")
                            .font(.title2.weight(.semibold))
                            .foregroundStyle(count == 0 ? WidgetColors.accentSoft : WidgetColors.accent)
                        Spacer()
                    }
                    Spacer()
                    Text("\(count)")
                        .font(Brand.displayLarge)
                        .foregroundStyle(count == 0 ? WidgetColors.text2 : WidgetColors.accent)
                    Text(count == 1 ? "needs follow-up" : "need follow-up")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(WidgetColors.text2)
                }
                .padding(16)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                .background(WidgetColors.panel)
                .accessibilityElement(children: .combine)
                .accessibilityLabel(count == 0 ? "All caught up, no calls need follow-up" : "\(count) \(count == 1 ? "call needs" : "calls need") follow-up")
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
                Text("Sign in to see status")
                    .font(.caption)
                    .foregroundStyle(WidgetColors.text2)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(WidgetColors.panel)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Sign in to see status")
        }
    }
}
