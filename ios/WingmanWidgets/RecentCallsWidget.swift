import SwiftUI
import WidgetKit

/// Glanceable recent-calls widget. Reads the App Group snapshot the app writes
/// (no network in the extension). The whole widget deep-links into the app's
/// Calls list via `wingman://calls`.
struct RecentCallsWidget: Widget {
    let kind = "RecentCallsWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SnapshotProvider()) { entry in
            RecentCallsView(snapshot: entry.snapshot)
                .widgetURL(URL(string: "wingman://calls"))
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Recent calls")
        .description("Your latest Wingman calls at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

private struct RecentCallsView: View {
    @Environment(\.widgetFamily) private var family
    let snapshot: WingmanWidgetSnapshot

    private var visibleCount: Int {
        switch family {
        case .systemSmall: return 2
        case .systemMedium: return 3
        default: return 6
        }
    }

    private var visibleCalls: [WingmanWidgetCall] {
        Array(snapshot.recentCalls.prefix(visibleCount))
    }

    /// `wingman://callback?number=…` for a call we can dial back. Encodes the
    /// "+" so it survives the query string. Nil when there's no usable number.
    private func callbackURL(_ call: WingmanWidgetCall) -> URL? {
        guard
            let number = call.number, !number.isEmpty,
            let encoded = number.addingPercentEncoding(withAllowedCharacters: .alphanumerics)
        else { return nil }
        return URL(string: "wingman://callback?number=\(encoded)")
    }

    var body: some View {
        if !snapshot.signedIn {
            signedOut
        } else if snapshot.recentCalls.isEmpty {
            empty
        } else {
            VStack(alignment: .leading, spacing: 8) {
                header
                ForEach(visibleCalls) { call in
                    // systemSmall can't host per-row links (one tap target only),
                    // so it falls through to the whole-widget `wingman://calls`.
                    if family != .systemSmall, let url = callbackURL(call) {
                        Link(destination: url) { row(call) }
                    } else {
                        row(call)
                    }
                    if call.id != visibleCalls.last?.id {
                        Divider().opacity(0.4)
                    }
                }
                Spacer(minLength: 0)
            }
        }
    }

    private var header: some View {
        HStack(spacing: 6) {
            Image(systemName: "phone.fill")
                .font(.caption2)
                .foregroundStyle(WidgetBrand.accent)
            Text("Recent calls")
                .font(.caption.weight(.semibold))
            Spacer()
            if snapshot.needsAttention > 0 {
                Text("\(snapshot.needsAttention)")
                    .font(.caption2.weight(.bold))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(WidgetBrand.accent.opacity(0.18), in: Capsule())
                    .foregroundStyle(WidgetBrand.accent)
            }
        }
    }

    private func row(_ call: WingmanWidgetCall) -> some View {
        HStack(spacing: 8) {
            Image(systemName: call.direction == "inbound" ? "arrow.down.left" : "arrow.up.right")
                .font(.caption2)
                .foregroundStyle(sentimentColor(call.sentiment))
                .frame(width: 14)
            VStack(alignment: .leading, spacing: 1) {
                Text(call.title)
                    .font(.footnote.weight(.medium))
                    .lineLimit(1)
                if family != .systemSmall, !call.subtitle.isEmpty {
                    Text(call.subtitle)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            if call.needsFollowUp {
                Circle().fill(WidgetBrand.accent).frame(width: 6, height: 6)
            }
        }
    }

    private var empty: some View {
        VStack(alignment: .leading, spacing: 6) {
            header
            Spacer()
            Text("No recent calls")
                .font(.footnote)
                .foregroundStyle(.secondary)
            Spacer()
        }
    }

    private var signedOut: some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: "phone.fill")
                .font(.title3)
                .foregroundStyle(WidgetBrand.accent)
            Spacer()
            Text("Sign in to Wingman")
                .font(.footnote.weight(.medium))
            Text("on your phone")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
