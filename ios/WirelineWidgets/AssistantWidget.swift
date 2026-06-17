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
    private let brandPurple = Color(red: 0.310, green: 0.118, blue: 0.482) // #4F1E7B
    private let brandDeep = Color(red: 0.231, green: 0.082, blue: 0.298) // #3B154C
    private let richCream = Color(red: 0.937, green: 0.914, blue: 0.863) // #EFE9DC
    private let deepInk = Color(red: 0.102, green: 0.086, blue: 0.078) // #1A1614

    private var brandGradient: LinearGradient {
        LinearGradient(
            gradient: Gradient(colors: [brandPurple, brandDeep]),
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

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
                ZStack {
                    Circle()
                        .fill(brandPurple.opacity(0.2))
                        .blur(radius: 12)
                        .scaleEffect(1.5)
                    Image(systemName: "sparkles")
                        .font(.title.weight(.semibold))
                        .foregroundStyle(brandPurple)
                }
                Spacer()
                Text("Send call to Assistant")
                    .font(Font.system(.headline, design: .serif).weight(.bold))
                    .foregroundStyle(deepInk)
                    .minimumScaleFactor(0.8)
                    .lineLimit(2)
                Text("Tap to route")
                    .font(.caption)
                    .foregroundStyle(deepInk.opacity(0.7))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(richCream)
        }
    }
}
