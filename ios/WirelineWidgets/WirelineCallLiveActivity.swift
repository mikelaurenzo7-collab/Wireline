import ActivityKit
import SwiftUI
import WidgetKit

/// Live Activity / Dynamic Island view for a real active Wireline call. The
/// content is intentionally factual and high-glanceability: service or caller,
/// current state, elapsed time, and a direct route to the in-app call controls.
@available(iOS 16.1, *)
struct WirelineCallLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WirelineCallActivityAttributes.self) { context in
            LockScreenCallActivityView(context: context)
                .activityBackgroundTint(WidgetColors.panel)
                .activitySystemActionForegroundColor(WidgetColors.accent)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 6) {
                        Image(systemName: "waveform")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(WidgetColors.accent)
                        Text("LIVE")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(WidgetColors.text3)
                    }
                }

                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.state.startedAt, style: .timer)
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(WidgetColors.text2)
                }

                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 4) {
                        Text(context.state.caller)
                            .font(.headline.weight(.semibold))
                            .foregroundStyle(WidgetColors.text)
                            .lineLimit(1)
                        Text(context.state.status)
                            .font(.caption)
                            .foregroundStyle(WidgetColors.text2)
                            .lineLimit(1)
                    }
                }

                DynamicIslandExpandedRegion(.bottom) {
                    Link(destination: routeURL(for: context.attributes.callId)) {
                        HStack(spacing: 8) {
                            Image(systemName: context.state.canTakeCall ? "arrow.down.left.circle.fill" : "waveform")
                            Text(context.state.canTakeCall ? "Open call controls" : "View call status")
                            Spacer()
                            Image(systemName: "chevron.right")
                        }
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                        .background(WidgetColors.accent, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    }
                }
            } compactLeading: {
                Image(systemName: "waveform")
                    .foregroundStyle(WidgetColors.accent)
            } compactTrailing: {
                Text(context.state.startedAt, style: .timer)
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(WidgetColors.text)
            } minimal: {
                Image(systemName: "waveform")
                    .foregroundStyle(WidgetColors.accent)
            }
            .widgetURL(routeURL(for: context.attributes.callId))
        }
    }

    private func routeURL(for callId: String) -> URL {
        URL(string: "wireline://call/\(callId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? callId)")!
    }
}

@available(iOS 16.1, *)
private struct LockScreenCallActivityView: View {
    let context: ActivityViewContext<WirelineCallActivityAttributes>

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("Wireline is handling this", systemImage: "waveform")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(WidgetColors.accent)
                Spacer()
                Text(context.state.startedAt, style: .timer)
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(WidgetColors.text2)
            }

            Text(context.state.caller)
                .font(.headline.weight(.semibold))
                .foregroundStyle(WidgetColors.text)
                .lineLimit(1)

            Text(context.state.status)
                .font(.subheadline)
                .foregroundStyle(WidgetColors.text2)
                .lineLimit(1)

            if let snippet = context.state.transcriptSnippet {
                Text("“\(snippet)”")
                    .font(.caption)
                    .foregroundStyle(WidgetColors.text2)
                    .lineLimit(2)
            }

            Link(destination: URL(string: "wireline://call/\(context.attributes.callId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? context.attributes.callId)")!) {
                Text(context.state.canTakeCall ? "Open call controls" : "View call status")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(WidgetColors.accent, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
        }
        .padding(16)
    }
}
