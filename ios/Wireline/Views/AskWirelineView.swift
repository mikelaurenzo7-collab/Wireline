import SwiftUI

/// The in-app Ask surface mirrors Siri and widget entry points with native,
/// concise actions that hand a request directly into real BotBound flows.
struct AskWirelineView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var agents: [Agent] = []
    @State private var showingDialer = false
    @State private var answer: String?
    @State private var isWorking = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    VStack(spacing: 10) {
                        Medallion(systemImage: "mic.fill", size: 60)
                        Text("What can BotBound help with?")
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(Brand.text)
                        Text("Dispatch a call, review live work, or clear follow-ups across the account.")
                            .font(.subheadline)
                            .foregroundStyle(Brand.text2)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.top, 8)

                    if let answer {
                        Text(answer)
                            .font(.callout)
                            .foregroundStyle(Brand.text)
                            .multilineTextAlignment(.leading)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(16)
                            .background(Brand.panel2, in: RoundedRectangle(cornerRadius: Brand.radiusMd, style: .continuous))
                    }

                    VStack(spacing: 8) {
                        actionCard("Place a call", "phone.arrow.up.right") { showingDialer = true }
                        actionCard("Summarize my last call", "text.bubble") { await run { try await summary() } }
                        actionCard("What needs my attention", "bell.badge") { await run { try await attention() } }
                    }

                    if isWorking { ProgressView().tint(Brand.accent).padding(.top, 4) }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 32)
            }
            .background(Brand.canvas.ignoresSafeArea())
            .navigationTitle("Ask BotBound")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
            }
            .tint(Brand.accent)
            .sheet(isPresented: $showingDialer) { OutboundCallView(agents: agents) }
            .task {
                if agents.isEmpty { agents = (try? await WirelineAPI.shared.agents()) ?? [] }
            }
        }
    }

    private func actionCard(_ title: String, _ icon: String, _ action: @escaping () async -> Void) -> some View {
        Button { Task { await action() } } label: {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Brand.accent)
                    .frame(width: 40, height: 40)
                    .background(Brand.accentSoft, in: Circle())
                Text(title)
                    .font(.callout.weight(.medium))
                    .foregroundStyle(Brand.text)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Brand.text3)
            }
            .padding(16)
            .brandGlowCard()
        }
        .buttonStyle(TouchPressStyle())
    }

    private func run(_ work: @escaping () async throws -> String) async {
        isWorking = true
        defer { isWorking = false }
        do { answer = try await work() }
        catch { answer = "Couldn't reach BotBound just now." }
    }

    private func summary() async throws -> String {
        let recent = try await WirelineAPI.shared.recentCalls(limit: 1)
        guard let call = recent.calls.first else { return "You don't have any calls yet." }
        return "Last call with \(call.customerNumber ?? "an unknown number"): \(call.summary ?? "No summary available.")"
    }

    private func attention() async throws -> String {
        let recent = try await WirelineAPI.shared.recentCalls(limit: 20)
        if recent.calls.isEmpty { return "No recent calls." }
        if recent.needsAttention == 0 { return "You're all caught up - \(recent.calls.count) recent calls, none flagged." }
        return "\(recent.needsAttention) of your \(recent.calls.count) recent calls need follow-up."
    }
}
