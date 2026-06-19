import SwiftUI

// Small, reusable brand pieces. iOS-native shapes (system fonts, standard
// controls) with the Wireline purple/cream accent layered on. Each has a
// #Preview so you can iterate in the Xcode canvas.

/// A circular purple-gradient badge — the "medallion" motif from the web UI.
struct Medallion: View {
    let systemImage: String
    var size: CGFloat = 44

    var body: some View {
        Image(systemName: systemImage)
            .font(.system(size: size * 0.42, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(
                LinearGradient(
                    colors: [Brand.purple, Brand.purpleDeep],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                in: Circle()
            )
    }
}

/// Filled primary button in brand purple.
struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(Brand.violet.opacity(configuration.isPressed ? 0.85 : 1), in: RoundedRectangle(cornerRadius: Brand.radiusMd))
    }
}

/// One agent in the roster.
struct AgentRow: View {
    let agent: Agent

    var body: some View {
        HStack(spacing: 12) {
            Medallion(systemImage: icon(for: agent.archetype), size: 40)
            VStack(alignment: .leading, spacing: 2) {
                Text(agent.name).font(.headline)
                if let role = agent.role {
                    Text(role.replacingOccurrences(of: "_", with: " ").capitalized)
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            Spacer()
            if let channels = agent.channels, !channels.isEmpty {
                HStack(spacing: 6) {
                    ForEach(channels.prefix(3), id: \.self) { ch in
                        Image(systemName: channelIcon(ch))
                            .font(.caption).foregroundStyle(Brand.purple)
                    }
                }
            }
        }
        .padding(.vertical, 4)
    }

    private func icon(for archetype: String?) -> String {
        switch (archetype ?? "").lowercased() {
        case let a where a.contains("sdr") || a.contains("sales"): return "chart.line.uptrend.xyaxis"
        case let a where a.contains("support"): return "lifepreserver"
        default: return "person.wave.2.fill"
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

/// A live/active call summary card.
struct CallCard: View {
    let call: ActiveCall

    var body: some View {
        HStack(spacing: 12) {
            Circle()
                .fill(isLive ? Brand.signal : Color.secondary)
                .frame(width: 10, height: 10)
            VStack(alignment: .leading, spacing: 2) {
                Text(call.customerNumber ?? "Unknown").font(.headline)
                Text(call.status?.capitalized ?? "—")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "waveform").foregroundStyle(Brand.purple)
        }
        .padding(.vertical, 4)
    }

    private var isLive: Bool { (call.status ?? "").lowercased() == "in-progress" }
}

/// Empty-state placeholder with the brand medallion.
struct BrandEmptyState: View {
    let title: String
    let message: String
    var systemImage: String = "sparkles"

    var body: some View {
        VStack(spacing: 12) {
            Medallion(systemImage: systemImage, size: 56)
            Text(title).font(.title3.weight(.semibold))
            Text(message)
                .font(.subheadline).foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
    }
}

#Preview("Components") {
    List {
        AgentRow(agent: Agent(id: "1", name: "Ava", role: "customer_service",
                              archetype: "Receptionist", channels: ["voice", "email"], voiceId: nil))
        CallCard(call: ActiveCall(callId: "c1", agentId: "1", customerNumber: "+1 555 123 4567",
                                  status: "in-progress", label: nil, type: "inbound"))
        Button("Place a call") {}.buttonStyle(PrimaryButtonStyle())
        BrandEmptyState(title: "No agents yet", message: "Create your first agent on the web to get started.")
    }
    .tint(Brand.purple)
}
