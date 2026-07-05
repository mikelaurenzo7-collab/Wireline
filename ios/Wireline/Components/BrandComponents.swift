import SwiftUI

struct Medallion: View {
    let systemImage: String
    var size: CGFloat = 44
    var label: String?

    var body: some View {
        Image(systemName: systemImage)
            .font(.system(size: size * 0.42, weight: .semibold))
            .foregroundStyle(Brand.accent)
            .frame(width: size, height: size)
            .background(Brand.accentSoft, in: Circle())
            .accessibilityHidden(true)
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline.weight(.semibold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(configuration.isPressed ? Brand.accentDeep : Brand.accent, in: RoundedRectangle(cornerRadius: Brand.radiusSm, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeInOut(duration: 0.20), value: configuration.isPressed)
    }
}

struct AssistantRow: View {
    let agent: Agent

    var body: some View {
        HStack(spacing: 12) {
            Medallion(systemImage: icon(for: agent.archetype), size: 40)
            VStack(alignment: .leading, spacing: 2) {
                Text(agent.name).font(.headline.weight(.semibold)).foregroundStyle(Brand.text)
                Text(postureLabel(for: agent))
                    .font(Brand.caption)
                    .foregroundStyle(Brand.text2)
            }
            Spacer()
            if let channels = agent.channels, !channels.isEmpty {
                HStack(spacing: 6) {
                    ForEach(channels.prefix(3), id: \.self) { channel in
                        Image(systemName: channelIcon(channel))
                            .font(Brand.caption)
                            .foregroundStyle(Brand.accent)
                    }
                }
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(agent.name), \(postureLabel(for: agent))")
    }

    private func postureLabel(for agent: Agent) -> String {
        if agent.isBusinessAgent == true { return "Business agent" }
        if let role = agent.role {
            return role.replacingOccurrences(of: "_", with: " ").capitalized.replacingOccurrences(of: "Assistant", with: "Agent")
        }
        return "Personal agent"
    }

    private func icon(for archetype: String?) -> String {
        switch (archetype ?? "").lowercased() {
        case let value where value.contains("sdr") || value.contains("sales"):
            return "chart.line.uptrend.xyaxis"
        case let value where value.contains("support"):
            return "lifepreserver"
        default:
            return "person.wave.2.fill"
        }
    }

    private func channelIcon(_ channel: String) -> String {
        switch channel.lowercased() {
        case "voice": return "phone.fill"
        case "email": return "envelope.fill"
        case "sms", "text": return "message.fill"
        default: return "dot.radiowaves.left.and.right"
        }
    }
}

struct CallCard: View {
    let call: ActiveCall

    var body: some View {
        HStack(spacing: 12) {
            Circle()
                .fill(isLive ? Brand.signal : Brand.text3)
                .frame(width: 8, height: 8)
            VStack(alignment: .leading, spacing: 2) {
                Text(call.customerNumber ?? "Unknown caller").font(.headline.weight(.semibold)).foregroundStyle(Brand.text)
                Text(call.status?.capitalized ?? "Call update").font(Brand.caption).foregroundStyle(Brand.text2)
            }
            Spacer()
            Image(systemName: "waveform").foregroundStyle(Brand.accent)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(isLive ? "Live" : "Recent") call from \(call.customerNumber ?? "unknown")")
    }

    private var isLive: Bool { (call.status ?? "").lowercased() == "in-progress" }
}

struct BrandEmptyState: View {
    let title: String
    let message: String
    var systemImage: String = "sparkles"

    var body: some View {
        VStack(spacing: 12) {
            Medallion(systemImage: systemImage, size: 56)
            Text(title).font(Brand.bodyStrong).foregroundStyle(Brand.text)
            Text(message).font(Brand.body).foregroundStyle(Brand.text2).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title), \(message)")
    }
}

#Preview("Components") {
    List {
        AssistantRow(agent: Agent(id: "1", name: "Ava", role: "personal_agent", archetype: "Personal Agent", channels: ["voice", "email"], voiceId: nil))
        CallCard(call: ActiveCall(callId: "c1", agentId: "1", customerNumber: "+1 555 123 4567", status: "in-progress", label: nil, type: "inbound"))
        Button("Place a call") {}.buttonStyle(PrimaryButtonStyle())
        BrandEmptyState(title: "No agents yet", message: "Set up your first call agent on the web to get started.")
    }
    .tint(Brand.accent)
    .wirelineBrand()
}
