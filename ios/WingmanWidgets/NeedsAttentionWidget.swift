import SwiftUI
import WidgetKit

/// "Needs attention" — a tight follow-up counter for the Home Screen (small)
/// and the Lock Screen (rectangular / inline accessories). Deep-links to the
/// Calls list so the user can act. Read-only; data comes from the App Group
/// snapshot the app writes.
struct NeedsAttentionWidget: Widget {
    let kind = "NeedsAttentionWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SnapshotProvider()) { entry in
            NeedsAttentionView(snapshot: entry.snapshot)
                .widgetURL(URL(string: "wingman://calls"))
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Needs attention")
        .description("How many calls are waiting on a follow-up.")
        .supportedFamilies([.systemSmall, .accessoryRectangular, .accessoryInline, .accessoryCircular])
    }
}

private struct NeedsAttentionView: View {
    @Environment(\.widgetFamily) private var family
    let snapshot: WingmanWidgetSnapshot

    private var count: Int { snapshot.needsAttention }

    var body: some View {
        switch family {
        case .accessoryInline:
            Label("\(count) to follow up", systemImage: "bell.badge")
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                VStack(spacing: 0) {
                    Image(systemName: "bell.badge").font(.caption2)
                    Text("\(count)").font(.headline)
                }
            }
        case .accessoryRectangular:
            HStack(spacing: 6) {
                Image(systemName: "bell.badge.fill")
                VStack(alignment: .leading, spacing: 1) {
                    Text("Needs attention").font(.caption2).foregroundStyle(.secondary)
                    Text(count == 0 ? "All clear" : "\(count) to follow up")
                        .font(.headline)
                }
            }
        default:
            VStack(alignment: .leading, spacing: 4) {
                Image(systemName: "bell.badge.fill")
                    .font(.title3)
                    .foregroundStyle(WidgetBrand.accent)
                Spacer()
                Text("\(count)")
                    .font(.system(size: 40, weight: .bold, design: .rounded))
                    .foregroundStyle(snapshot.signedIn ? .primary : .secondary)
                Text(count == 1 ? "call to follow up" : "calls to follow up")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
