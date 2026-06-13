import WidgetKit
import SwiftUI

/// Home Screen + Lock Screen widget that launches the "Ask Wingman" surface.
/// It's a deep-link launcher (no App Group / shared data needed): the whole
/// widget taps through to `wingman://ask`, which the app routes to the Ask
/// sheet. This is the glanceable, one-tap activation vector off the car.
struct AskWingmanWidget: Widget {
    let kind = "AskWingmanWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { _ in
            AskWingmanWidgetView()
                .widgetURL(URL(string: "wingman://ask"))
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Ask Wingman")
        .description("Start a Wingman request from your Home or Lock Screen.")
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular])
    }

    struct Entry: TimelineEntry { let date: Date }

    struct Provider: TimelineProvider {
        func placeholder(in context: Context) -> Entry { Entry(date: .now) }
        func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
            completion(Entry(date: .now))
        }
        func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
            // Static launcher — a single far-future entry, no refresh needed.
            completion(Timeline(entries: [Entry(date: .now)], policy: .never))
        }
    }
}

private struct AskWingmanWidgetView: View {
    @Environment(\.widgetFamily) private var family

    var body: some View {
        switch family {
        case .accessoryCircular:
            Image(systemName: "mic.fill").font(.title2)
        case .accessoryRectangular:
            Label("Ask Wingman", systemImage: "mic.fill").font(.headline)
        default:
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: "mic.fill").font(.title)
                Spacer()
                Text("Ask Wingman").font(.headline)
                Text("Tap to start").font(.caption).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
