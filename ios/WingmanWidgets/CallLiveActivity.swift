import SwiftUI
import WidgetKit

#if canImport(ActivityKit)
    import ActivityKit

    /// In-call Live Activity: Lock Screen banner + Dynamic Island. Renders the
    /// shared `WingmanCallActivityAttributes` the app publishes while a call is
    /// live. Tapping anywhere opens the app on the call (`wingman://call?id=…`),
    /// where the user can take it over — the activity itself never places or
    /// transfers a call.
    @available(iOS 16.1, *)
    struct CallLiveActivity: Widget {
        var body: some WidgetConfiguration {
            ActivityConfiguration(for: WingmanCallActivityAttributes.self) { context in
                LockScreenCallView(context: context)
                    .padding(14)
                    .activityBackgroundTint(Color.black.opacity(0.35))
                    .activitySystemActionForegroundColor(WidgetBrand.accent)
            } dynamicIsland: { context in
                DynamicIsland {
                    DynamicIslandExpandedRegion(.leading) {
                        Label {
                            Text(context.attributes.agentName).font(.caption).lineLimit(1)
                        } icon: {
                            Image(systemName: "phone.fill").foregroundStyle(WidgetBrand.accent)
                        }
                    }
                    DynamicIslandExpandedRegion(.trailing) {
                        Text(context.state.startedAt, style: .timer)
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: 56, alignment: .trailing)
                    }
                    DynamicIslandExpandedRegion(.center) {
                        Text(context.attributes.peerLabel)
                            .font(.footnote.weight(.medium))
                            .lineLimit(1)
                    }
                    DynamicIslandExpandedRegion(.bottom) {
                        HStack(spacing: 6) {
                            PhaseDot(phase: context.state.phase)
                            Text(phaseLabel(context.state.phase))
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                            if let detail = context.state.detail, !detail.isEmpty {
                                Text("· \(detail)").font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                            }
                            Spacer()
                            Text("Tap to take").font(.caption2.weight(.semibold)).foregroundStyle(WidgetBrand.accent)
                        }
                    }
                } compactLeading: {
                    Image(systemName: "phone.fill").foregroundStyle(WidgetBrand.accent)
                } compactTrailing: {
                    Text(context.state.startedAt, style: .timer)
                        .font(.caption2.monospacedDigit())
                        .frame(maxWidth: 44)
                } minimal: {
                    Image(systemName: "phone.fill").foregroundStyle(WidgetBrand.accent)
                }
                .widgetURL(URL(string: "wingman://call?id=\(context.attributes.callId)"))
                .keylineTint(WidgetBrand.accent)
            }
        }
    }

    @available(iOS 16.1, *)
    private struct LockScreenCallView: View {
        let context: ActivityViewContext<WingmanCallActivityAttributes>

        var body: some View {
            HStack(spacing: 12) {
                ZStack {
                    Circle().fill(WidgetBrand.accent.opacity(0.18)).frame(width: 40, height: 40)
                    Image(systemName: "phone.fill").foregroundStyle(WidgetBrand.accent)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(context.attributes.peerLabel)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    HStack(spacing: 6) {
                        PhaseDot(phase: context.state.phase)
                        Text(phaseLabel(context.state.phase))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        Text("· \(context.attributes.agentName)")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(context.state.startedAt, style: .timer)
                        .font(.callout.monospacedDigit().weight(.semibold))
                        .foregroundStyle(.primary)
                    Text("Tap to take").font(.caption2).foregroundStyle(WidgetBrand.accent)
                }
            }
        }
    }

    @available(iOS 16.1, *)
    private struct PhaseDot: View {
        let phase: String
        var body: some View {
            Circle().fill(phaseColor(phase)).frame(width: 7, height: 7)
        }
    }

    private func phaseLabel(_ phase: String) -> String {
        switch phase {
        case "ringing": return "Ringing"
        case "wrapping": return "Wrapping up"
        default: return "Live"
        }
    }

    private func phaseColor(_ phase: String) -> Color {
        switch phase {
        case "ringing": return .orange
        case "wrapping": return .secondary
        default: return .green
        }
    }
#endif
