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
                VStack(spacing: 20) {
                    Medallion(systemImage: "mic.fill", size: 64)
                    Text("What can Wingman do?")
                        .font(.title3.weight(.semibold))

                    if let answer {
                        Text(answer)
                            .font(.callout)
                            .multilineTextAlignment(.leading)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(14)
                            .background(Brand.paperWarm, in: Rectangle())
                    }

                    VStack(spacing: 12) {
                        action("Place a call", "phone.arrow.up.right") { showingDialer = true }
                        action("Summarize my last call", "text.bubble") {
                            await run { try await summary() }
                        }
                        action("What needs my attention", "bell.badge") {
                            await run { try await attention() }
                        }
                    }
                    if isWorking { ProgressView() }
                    Spacer(minLength: 0)
                }
                .padding(24)
            }
            .background(Brand.paper.ignoresSafeArea())
            .navigationTitle("Ask Wingman")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
            .tint(Brand.purple)
            .sheet(isPresented: $showingDialer) { OutboundCallView(agents: agents) }
            .task { if agents.isEmpty { agents = (try? await WingmanAPI.shared.agents()) ?? [] } }
        }
    }

    private func action(_ title: String, _ icon: String, _ run: @escaping () async -> Void) -> some View {
        Button { Task { await run() } } label: {
            HStack {
                Image(systemName: icon)
                Text(title)
                Spacer()
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary)
            }
            .padding(14)
            .frame(maxWidth: .infinity)
            .background(.regularMaterial, in: Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func run(_ work: @escaping () async throws -> String) async {
        isWorking = true
        defer { isWorking = false }
        do { answer = try await work() } catch { answer = "Couldn't reach Wingman just now." }
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
