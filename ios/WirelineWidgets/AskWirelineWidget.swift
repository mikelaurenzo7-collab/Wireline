import WidgetKit
import SwiftUI

/// Home Screen + Lock Screen widget that launches the Ask Wireline surface.
struct AskWirelineWidget: Widget {
    let kind = "AskWirelineWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { _ in
            AskWirelineWidgetView()
                .widgetURL(URL(string: "wireline://ask"))
                .containerBackground(WidgetColors.panel, for: .widget)
        }
        .configurationDisplayName("Ask Wireline")
        .description("Start a Wireline request from your Home or Lock Screen.")
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

private struct AskWirelineWidgetView: View {
    @Environment(\.widgetFamily) private var family

    var body: some View {
        switch family {
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                Image(systemName: "mic.fill")
                    .font(Brand.displayLarge)
                    .foregroundStyle(WidgetColors.accent)
            }
        case .accessoryRectangular:
            HStack(spacing: 8) {
                Image(systemName: "mic.fill")
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(WidgetColors.accent)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Ask Wireline").font(Brand.h1)
                    Text("Tap to start").font(Brand.caption).foregroundStyle(.secondary)
                }
            }
        case .systemMedium:
            HStack(spacing: 14) {
                Image(systemName: "mic.fill")
                    .font(Brand.displayLarge)
                    .foregroundStyle(WidgetColors.accent)
                    .frame(width: 44, height: 44)
                    .background(WidgetColors.accentSoft, in: Circle())
                VStack(alignment: .leading, spacing: 4) {
                    Text("Ask Wireline").font(Brand.bodyStrong).foregroundStyle(WidgetColors.text)
                    Text("Hand off a call, the wait, and the follow-up.")
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
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Ask Wireline, tap to start")
        default:
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: "mic.fill")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(WidgetColors.accent)
                    .frame(width: 40, height: 40)
                    .background(WidgetColors.accentSoft, in: Circle())
                Spacer()
                Text("Ask Wireline")
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(WidgetColors.text)
                    .minimumScaleFactor(0.8)
                    .lineLimit(2)
                Text("Tap to start")
                    .font(Brand.caption)
                    .foregroundStyle(WidgetColors.text2)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Ask Wireline, tap to start")
        }
    }
}

#Preview(as: .systemSmall) {
    AskWirelineWidget()
} timeline: {
    AskWirelineWidget.Entry(date: .now)
}
