import WidgetKit
import SwiftUI

/// Home Screen + Lock Screen widget that launches the Assistant routing surface.
/// It's a deep-link launcher (no App Group / shared data needed): the whole
/// widget taps through to `assistant://route`, which the app routes to the Assistant
/// handoff sheet. This is the glanceable, one-tap activation vector off the car.
struct AssistantWidget: Widget {
    let kind = "AssistantWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { _ in
            AssistantWidgetView()
                .widgetURL(URL(string: "assistant://route"))
                .containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("Assistant")
        .description("Route an active call to your Assistant from the Home or Lock Screen.")
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

private struct AssistantWidgetView: View {
    @Environment(\.widgetFamily) private var family

    var body: some View {
        let geminiGradient = LinearGradient(
            gradient: Gradient(colors: [
                Color(red: 0.28, green: 0.52, blue: 0.93), // Gemini Blue
                Color(red: 0.59, green: 0.35, blue: 0.88), // Gemini Purple
                Color(red: 0.89, green: 0.40, blue: 0.40)  // Gemini Pink
            ]),
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )

        switch family {
        case .accessoryCircular:
            Image(systemName: "sparkles").font(.title2)
        case .accessoryRectangular:
            Label("Assistant", systemImage: "sparkles").font(.headline)
        default:
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: "sparkles")
                    .font(.title)
                    .foregroundStyle(.white)
                Spacer()
                Text("Send call to Assistant")
                    .font(.headline)
                    .foregroundStyle(.white)
                    .minimumScaleFactor(0.8)
                    .lineLimit(2)
                Text("Tap to route")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.8))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(geminiGradient)
        }
    }
}
