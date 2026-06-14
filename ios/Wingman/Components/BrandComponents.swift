import SwiftUI

// Small, reusable brand pieces. iOS-native shapes (system fonts, standard
// controls) with the Wireline purple/cream accent layered on, elevated with
// specular depth, soft brand halos, and zero-latency spring press feedback —
// mirroring the web design system's premium treatment. Each has a #Preview so
// you can iterate in the Xcode canvas.

/// The signature purple-gradient badge ("medallion") with a specular rim,
/// soft drop shadow, and an optional brand halo bloom behind it.
struct Medallion: View {
    let systemImage: String
    var size: CGFloat = 44
    /// Soft purple glow behind the badge — used on empty/idle/identity states.
    var withHalo: Bool = false

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
            // Specular rim: bright at the top, fading down — reads as raised glass.
            .overlay(
                Circle().strokeBorder(
                    LinearGradient(
                        colors: [.white.opacity(0.45), .white.opacity(0.04)],
                        startPoint: .top,
                        endPoint: .bottom
                    ),
                    lineWidth: 0.75
                )
            )
            .shadow(color: Brand.purpleDeep.opacity(0.32), radius: size * 0.16, y: size * 0.08)
            .background {
                if withHalo {
                    Circle()
                        .fill(Brand.purple.opacity(0.35))
                        .blur(radius: size * 0.38)
                        .scaleEffect(1.5)
                }
            }
    }
}

/// Filled primary button: brand gradient, specular hairline, soft brand-tinted
/// depth shadow, and a spring press that scales + softens the shadow.
struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .background(
                LinearGradient(
                    colors: [Brand.purple, Brand.purpleDeep],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                in: RoundedRectangle(cornerRadius: 13, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 13, style: .continuous)
                    .strokeBorder(.white.opacity(0.18), lineWidth: 0.5)
            )
            .shadow(
                color: Brand.purple.opacity(configuration.isPressed ? 0.18 : 0.34),
                radius: configuration.isPressed ? 5 : 14,
                y: configuration.isPressed ? 2 : 7
            )
            .scaleEffect(configuration.isPressed ? 0.975 : 1)
            .animation(.spring(response: 0.32, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

/// Premium cream card surface (mirrors the web `.wl-panel`): warm paper fill,
/// hairline ink border, and a soft ambient shadow. Opt-in via `.wingmanCard()`.
struct WingmanCard: ViewModifier {
    var padding: CGFloat = 14
    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(Brand.paperWarm, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(Brand.ink.opacity(0.06), lineWidth: 1)
            )
            .shadow(color: Brand.ink.opacity(0.05), radius: 10, y: 4)
    }
}

extension View {
    func wingmanCard(padding: CGFloat = 14) -> some View {
        modifier(WingmanCard(padding: padding))
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

/// A live/active call summary card with an animated pulse on live calls.
struct CallCard: View {
    let call: ActiveCall
    @State private var pulse = false

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                if isLive {
                    Circle()
                        .fill(Brand.signal.opacity(0.55))
                        .frame(width: 10, height: 10)
                        .scaleEffect(pulse ? 2.4 : 1)
                        .opacity(pulse ? 0 : 0.6)
                }
                Circle()
                    .fill(isLive ? Brand.signal : Color.secondary)
                    .frame(width: 10, height: 10)
            }
            .frame(width: 12, height: 12)
            VStack(alignment: .leading, spacing: 2) {
                Text(call.customerNumber ?? "Unknown").font(.headline)
                Text(call.status?.capitalized ?? "—")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "waveform").foregroundStyle(Brand.purple)
        }
        .padding(.vertical, 4)
        .onAppear {
            guard isLive else { return }
            withAnimation(.easeOut(duration: 1.4).repeatForever(autoreverses: false)) { pulse = true }
        }
    }

    private var isLive: Bool { (call.status ?? "").lowercased() == "in-progress" }
}

/// Empty-state placeholder with the haloed brand medallion.
struct BrandEmptyState: View {
    let title: String
    let message: String
    var systemImage: String = "sparkles"

    var body: some View {
        VStack(spacing: 14) {
            Medallion(systemImage: systemImage, size: 60, withHalo: true)
            Text(title).font(.title3.weight(.semibold))
            Text(message)
                .font(.subheadline).foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 36)
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
