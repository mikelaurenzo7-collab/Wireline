import WidgetKit
import SwiftUI

/// Home Screen + Lock Screen widget that launches the Assistant routing surface.
/// It's a deep-link launcher (no App Group / shared data needed): the whole
/// widget taps through to `wireline://ask`, which the app routes to the Assistant
/// composer. This is the glanceable, one-tap activation vector off the car.
struct AssistantWidget: Widget {
    let kind = "AssistantWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { _ in
            AssistantWidgetView()
                .widgetURL(URL(string: "wireline://ask"))
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
        switch family {
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                Image(systemName: "sparkles")
                    .font(.title2.weight(.semibold))
            }
        case .accessoryRectangular:
            HStack(spacing: 8) {
                Image(systemName: "sparkles")
                    .font(.headline.weight(.semibold))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Assistant")
                        .font(.headline.weight(.bold))
                    Text("Tap to route call")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        default:
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: "sparkles")
                    .font(.title.weight(.semibold))
                    .foregroundStyle(.white)
                Spacer()
                Text("Send call to Assistant")
                    .font(.headline.weight(.bold))
                    .foregroundStyle(.white)
                    .minimumScaleFactor(0.8)
                    .lineLimit(2)
                Text("Tap to route")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.72))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(WidgetTheme.accentGradient)
        }
    }
}
