import WidgetKit
import SwiftUI

/// Deep-link launcher for Assistant handoff — Professional Heritage v2 styling.
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
                    .foregroundStyle(WidgetColors.accent)
                Spacer()
                Text("Send call to Assistant")
                    .font(Font.system(.headline, design: .serif).weight(.bold))
                    .foregroundStyle(WidgetColors.text)
                    .minimumScaleFactor(0.8)
                    .lineLimit(2)
                Text("Tap to route")
                    .font(.caption)
                    .foregroundStyle(WidgetColors.text2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(WidgetColors.panel)
        }
    }
}
