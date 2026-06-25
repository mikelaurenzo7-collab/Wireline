import WidgetKit
import SwiftUI

/// Deep-link launcher for Assistant handoff — Wireline Precision styling.
struct AssistantWidget: Widget {
    let kind = "AssistantWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { _ in
            AssistantWidgetView()
                .widgetURL(URL(string: "assistant://route"))
                .containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("Assistant Coverage")
        .description("View current call coverage rates and active screening status.")
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
                    .font(Brand.displayLarge)
            }
        case .accessoryRectangular:
            HStack(spacing: 8) {
                Image(systemName: "sparkles")
                    .font(Brand.h1)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Assistant")
                        .font(Brand.h1)
                    Text("Tap to route call")
                        .font(Brand.caption)
                        .foregroundStyle(.secondary)
                }
            }
        default:
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: "sparkles")
                    .font(Brand.bodyStrong)
                    .foregroundStyle(WidgetColors.accent)
                Spacer()
                Text("100% Coverage")
                    .font(Brand.h1)
                    .foregroundStyle(WidgetColors.accent)
                    .minimumScaleFactor(0.8)
                    .lineLimit(2)
                Text("All active calls screened")
                    .font(.caption)
                    .foregroundStyle(WidgetColors.text2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(WidgetColors.panel)
        }
    }
}
