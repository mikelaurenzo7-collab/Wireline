import SwiftUI

/// The in-app "Ask Wingman" surface — the on-screen twin of the Siri/Action-
/// button entry points. Presents the same approved actions, and runs the ones
/// that return spoken answers (summary, attention digest) inline.
struct AskWingmanView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var agents: [Agent] = []
    @State private var showingDialer = false
    @State private var answer: String?
    @State private var isWorking = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Header
                    VStack(spacing: 10) {
                        Medallion(systemImage: "mic.fill", size: 68)
                            .shadow(color: Brand.purple.opacity(0.3), radius: 16)
                        Text("What can Wingman do?")
                            .font(.title3.weight(.semibold))
                    }
                    .padding(.top, 8)

                    // Inline answer card
                    if let answer {
                        Text(answer)
                            .font(.callout)
                            .multilineTextAlignment(.leading)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(16)
                            .background(Brand.paperWarm, in: RoundedRectangle(cornerRadius: 12))
                    }

                    // Action cards
                    VStack(spacing: 10) {
                        actionCard("Place a call", "phone.arrow.up.right") {
                            showingDialer = true
                        }
                        actionCard("Summarize my last call", "text.bubble") {
                            await run { try await summary() }
                        }
                        actionCard("What needs my attention", "bell.badge") {
                            await run { try await attention() }
                        }
                    }

                    if isWorking {
                        ProgressView().padding(.top, 4)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 32)
            }
            .background(Brand.paper.ignoresSafeArea())
            .navigationTitle("Ask Wingman")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .tint(Brand.purple)
            .sheet(isPresented: $showingDialer) { OutboundCallView(agents: agents) }
            .task {
                if agents.isEmpty {
                    agents = (try? await WingmanAPI.shared.agents()) ?? []
                }
            }
        }
    }

    private func actionCard(
        _ title: String,
        _ icon: String,
        _ action: @escaping () async -> Void
    ) -> some View {
        Button { Task { await action() } } label: {
            HStack(spacing: 14) {
                ZStack {
                    Circle().fill(Brand.accentTint).frame(width: 40, height: 40)
                    Image(systemName: icon)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Brand.purple)
                }
                Text(title)
                    .font(.callout.weight(.medium))
                    .foregroundStyle(.primary)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
    }

    private func run(_ work: @escaping () async throws -> String) async {
        isWorking = true
        defer { isWorking = false }
        do {
            answer = try await work()
        } catch {
            answer = "Couldn't reach Wingman just now."
        }
    }

    private func summary() async throws -> String {
        let recent = try await WingmanAPI.shared.recentCalls(limit: 1)
        guard let call = recent.calls.first else { return "You don't have any calls yet." }
        let who = call.customerNumber ?? "an unknown number"
        return "Last call with \(who): \(call.summary ?? "No summary available.")"
    }

    private func attention() async throws -> String {
        let recent = try await WingmanAPI.shared.recentCalls(limit: 20)
        if recent.calls.isEmpty { return "No recent calls." }
        if recent.needsAttention == 0 {
            return "You're all caught up — \(recent.calls.count) recent calls, none flagged."
        }
        return "\(recent.needsAttention) of your \(recent.calls.count) recent calls need follow-up."
    }
}
