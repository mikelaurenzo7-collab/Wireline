import WidgetKit
import SwiftUI

/// Deep-link launcher for agent handoff.
struct AssistantWidget: Widget {
    let kind = "AssistantWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { _ in
            AssistantWidgetView()
                .widgetURL(URL(string: "wireline://agents"))
                .containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("Wireline Agents")
        .description("Open Wireline agents with mono clarity — coverage, handoff, and live work.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
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
                    Text("Agents")
                        .font(Brand.h1)
                    Text("Tap to route call")
                        .font(Brand.caption)
                        .foregroundStyle(.secondary)
                }
            }
        case .systemMedium:
            HStack(spacing: 14) {
                Image(systemName: "sparkles")
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(WidgetColors.accent)
                    .frame(width: 44, height: 44)
                    .background(WidgetColors.accentSoft, in: Circle())
                VStack(alignment: .leading, spacing: 4) {
                    Text("Wireline Agents").font(Brand.bodyStrong).foregroundStyle(WidgetColors.text)
                    Text("Coverage, handoff, and live work.")
                        .font(Brand.caption)
                        .foregroundStyle(WidgetColors.text2)
                        .lineLimit(2)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(WidgetColors.text3)
            }
            .padding(16)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(WidgetColors.panel)
        default:
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Image(systemName: "sparkles")
                        .font(Brand.bodyStrong)
                        .foregroundStyle(WidgetColors.accent)
                    Spacer()
                }
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
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Wireline agents, all active calls screened")
        }
    }
}
