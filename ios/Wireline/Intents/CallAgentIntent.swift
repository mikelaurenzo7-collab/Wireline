import AppIntents

/// "Hey Siri, tell Wireline to call the doctor, I'll be five minutes late."
///
/// Resolves an agent by name and hands a free-text instruction to the backend,
/// which builds the agent's system prompt and dials via Vapi. No prompt logic
/// runs on the device.
struct CallAgentIntent: AppIntent {
    static var title: LocalizedStringResource = "Have an agent place a call"
    static var description = IntentDescription(
        "Asks a Wireline agent to call someone with an optional instruction."
    )
    // Opening the app is unnecessary — this runs in the background via Siri.
    static var openAppWhenRun = false

    @Parameter(title: "Agent")
    var agentName: String

    @Parameter(title: "Phone number")
    var phoneNumber: String

    @Parameter(title: "Instruction", default: "")
    var context: String

    static var parameterSummary: some ParameterSummary {
        Summary("Have \(\.$agentName) call \(\.$phoneNumber) and say \(\.$context)")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard KeychainStore.loadToken() != nil else {
            return .result(dialog: "Open Wireline and sign in first.")
        }
        do {
            let agents = try await WirelineAPI.shared.agents()
            guard let agent = agents.first(where: {
                $0.name.localizedCaseInsensitiveContains(agentName)
            }) else {
                return .result(dialog: "I couldn't find an agent named \(agentName).")
            }
            try await WirelineAPI.shared.placeCall(
                agentId: agent.id,
                to: phoneNumber,
                context: context.isEmpty ? nil : context
            )
            return .result(dialog: "\(agent.name) is calling \(phoneNumber) now.")
        } catch let WirelineAPI.APIError.http(status, _) where status == 401 || status == 403 {
            return .result(dialog: "Your session has expired. Open Wireline to sign in again.")
        } catch {
            return .result(dialog: "I couldn't place that call right now. Try again in a moment.")
        }
    }
}
