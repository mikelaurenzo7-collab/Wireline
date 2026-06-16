import WidgetKit
import SwiftUI

/// Lock Screen + Home Screen widget showing how many calls need follow-up.
/// Reads from the shared `WirelineWidgetSnapshot` written by the app. Tapping
/// deep-links to `wireline://calls` to surface the full call list.
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
            // Refresh every 15 minutes as a backstop; the app reloads on foreground.
            let next = Calendar.current.date(byAdding: .minute, value: 15, to: .now) ?? .now
            completion(Timeline(entries: [entry], policy: .after(next)))
        }
    }
}

private struct NeedsAttentionWidgetView: View {
    let count: Int
    let signedIn: Bool

    @Environment(\.widgetFamily) private var family

    private let brandPurple = Color(red: 0.545, green: 0.247, blue: 0.839)

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
                        .foregroundStyle(count == 0 ? .green : .primary)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(count == 0 ? "All caught up" : "\(count) need attention")
                            .font(.headline.weight(.bold))
                        Text(count == 0 ? "No pending follow-ups" : "Calls need follow-up")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            default: // .systemSmall
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Image(systemName: count == 0 ? "checkmark.circle.fill" : "bell.badge.fill")
                            .font(.title2.weight(.semibold))
                            .foregroundStyle(count == 0 ? .green : brandPurple)
                        Spacer()
                    }
                    Spacer()
                    Text("\(count)")
                        .font(.system(size: 48, weight: .heavy, design: .rounded))
                        .foregroundStyle(count == 0 ? .secondary : .primary)
                    Text(count == 1 ? "needs follow-up" : "need follow-up")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                }
                .padding(16)
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
                    .foregroundStyle(.secondary)
                Text("Sign in to see status")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}
