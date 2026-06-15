import WidgetKit
import SwiftUI

/// Home Screen + Lock Screen widget that launches the "Ask Wireline" surface.
/// It's a deep-link launcher (no App Group / shared data needed): the whole
/// widget taps through to `wireline://ask`, which the app routes to the Ask
/// sheet. This is the glanceable, one-tap activation vector off the car.
struct AskWirelineWidget: Widget {
    let kind = "AskWirelineWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { _ in
            AskWirelineWidgetView()
                .widgetURL(URL(string: "wireline://ask"))
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Ask Wireline")
        .description("Start a Wireline request from your Home or Lock Screen.")
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

private struct AskWirelineWidgetView: View {
    @Environment(\.widgetFamily) private var family

    var body: some View {
        switch family {
        case .accessoryCircular:
            Image(systemName: "mic.fill").font(.title2)
        case .accessoryRectangular:
            Label("Ask Wireline", systemImage: "mic.fill").font(.headline)
        default:
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: "mic.fill").font(.title)
                Spacer()
                Text("Ask Wireline").font(.headline)
                Text("Tap to start").font(.caption).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
