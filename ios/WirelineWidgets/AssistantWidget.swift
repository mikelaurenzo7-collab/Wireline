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

    /// Wireline brand gradient — matches the web and iOS app's Rich Cream + Purple
    /// design system. The old Gemini blue/purple/pink gradient was off-brand.
    private let brandGradient = LinearGradient(
        gradient: Gradient(colors: [
            Color(red: 0.545, green: 0.247, blue: 0.839), // #8B3FD6 Brand Purple
            Color(red: 0.231, green: 0.082, blue: 0.298), // #3B154C Brand Deep
        ]),
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

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
                    .foregroundStyle(.white.opacity(0.7))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(brandGradient)
        }
    }
}
