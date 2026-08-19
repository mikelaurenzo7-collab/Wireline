import ActivityKit
import SwiftUI
import WidgetKit

/// Live Activity / Dynamic Island view for a real active BotBound call. The
/// main app supplies factual call state; this extension renders the compact
/// Smart Route affordance and never fabricates a transcript or action result.
@available(iOS 16.1, *)
struct WirelineCallLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WirelineCallActivityAttributes.self) { context in
            LockScreenCallActivityView(context: context)
                .widgetURL(routeURL(for: context.attributes.callId))
                .activityBackgroundTint(WidgetColors.panel)
                .activitySystemActionForegroundColor(WidgetColors.accent)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 6) {
                        PulseMark(size: 22)
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
                    VStack(spacing: 3) {
                        Text(context.attributes.assistantName)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(WidgetColors.text)
                            .lineLimit(1)
                        Text(context.state.status)
                            .font(.caption2)
                            .foregroundStyle(WidgetColors.text2)
                            .lineLimit(1)
                    }
                }

                DynamicIslandExpandedRegion(.bottom) {
                    HStack(spacing: 10) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(context.state.transcriptSnippet ?? context.state.caller)
                                .font(.caption)
                                .foregroundStyle(.primary)
                                .lineLimit(2)
                            Text(context.state.caller)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                        Spacer(minLength: 8)
                        if context.state.canTakeCall {
                            Link(destination: routeURL(for: context.attributes.callId)) {
                                Label("Smart Route", systemImage: "arrow.triangle.branch")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(WidgetColors.text)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 8)
                                    .background(WidgetColors.accentSoft, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                            }
                        }
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
            .keylineTint(WidgetColors.accent)
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
            HStack(spacing: 8) {
                PulseMark(size: 22)
                Text("BotBound is handling this")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(WidgetColors.accent)
                Spacer()
                Text(context.state.startedAt, style: .timer)
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(WidgetColors.text2)
            }

            Text(context.attributes.assistantName)
                .font(.headline.weight(.semibold))
                .foregroundStyle(WidgetColors.text)
                .lineLimit(1)

            Text(context.state.transcriptSnippet ?? context.state.caller)
                .font(.subheadline)
                .foregroundStyle(WidgetColors.text2)
                .lineLimit(2)

            if context.state.canTakeCall {
                Link(destination: URL(string: "wireline://call/\(context.attributes.callId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? context.attributes.callId)")!) {
                    Label("Smart Route", systemImage: "arrow.triangle.branch")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(WidgetColors.accent, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                }
            }
        }
        .padding(16)
    }
}

@available(iOS 16.1, *)
private struct PulseMark: View {
    let size: CGFloat

    var body: some View {
        ZStack {
            Circle().fill(WidgetColors.accentSoft)
            Image(systemName: "waveform")
                .font(.system(size: size * 0.45, weight: .semibold))
                .foregroundStyle(WidgetColors.accent)
        }
        .frame(width: size, height: size)
        .accessibilityLabel("BotBound active call")
    }
}
