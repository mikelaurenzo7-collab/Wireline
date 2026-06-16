import WidgetKit
import SwiftUI

/// Home Screen + Lock Screen widget that launches the "Ask Wireline" surface.
struct AskWirelineWidget: Widget {
    let kind = "AskWirelineWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { _ in
            AskWirelineWidgetView()
                .widgetURL(URL(string: "wireline://ask"))
                .containerBackground(.clear, for: .widget)
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
                Image(systemName: "mic.fill")
                    .font(.title)
                    .foregroundStyle(.white)
                Spacer()
                Text("Ask Wireline")
                    .font(.headline)
                    .foregroundStyle(.white)
                    .minimumScaleFactor(0.8)
                    .lineLimit(2)
                Text("Tap to start")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.8))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(LinearGradient(
                colors: [Color(hex: "8B3FD6"), Color(hex: "6B2FB8")],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ))
        }
    }
}

#Preview(as: .systemSmall) {
    AskWirelineWidget()
} timeline: {
    SimpleEntry(date: .now)
}
