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

    /// Midnight accent gradient (iris) — matches the web + app design system.
    private let brandGradient = WidgetTheme.accentGradient

    var body: some View {
        switch family {
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                Image(systemName: "mic.fill")
                    .font(.title2.weight(.semibold))
            }
        case .accessoryRectangular:
            HStack(spacing: 8) {
                Image(systemName: "mic.fill")
                    .font(.headline.weight(.semibold))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Ask Wireline")
                        .font(.headline.weight(.bold))
                    Text("Tap to start")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        case .systemMedium:
            HStack(spacing: 16) {
                Image(systemName: "mic.fill")
                    .font(.largeTitle.weight(.semibold))
                    .foregroundStyle(.white)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Ask Wireline")
                        .font(.title3.weight(.bold))
                        .foregroundStyle(.white)
                    Text("Place calls, get recaps, and more")
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.72))
                        .lineLimit(2)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.white.opacity(0.5))
            }
            .padding(16)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(brandGradient)
        default: // .systemSmall
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: "mic.fill")
                    .font(.title.weight(.semibold))
                    .foregroundStyle(.white)
                Spacer()
                Text("Ask Wireline")
                    .font(.headline.weight(.bold))
                    .foregroundStyle(.white)
                    .minimumScaleFactor(0.8)
                    .lineLimit(2)
                Text("Tap to start")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.72))
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(brandGradient)
        }
    }
}

#Preview(as: .systemSmall) {
    AskWirelineWidget()
} timeline: {
    AskWirelineWidget.Entry(date: .now)
}
