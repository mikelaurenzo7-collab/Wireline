import AppIntents

/// "Hey Siri, tell Wingman to call the doctor, I'll be five minutes late."
///
/// Resolves an agent by name and hands a free-text instruction to the backend,
/// which builds the agent's system prompt and dials via Vapi. No prompt logic
/// runs on the device.
struct CallAgentIntent: AppIntent {
    static var title: LocalizedStringResource = "Have Wingman place a call"
    static var description = IntentDescription(
        "Ask Wingman to call a person or business with your message, like telling the doctor you are running late."
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
        Summary("Have Wingman call \(\.$phoneNumber) and say \(\.$context) using \(\.$agentName)")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let agents = try await WingmanAPI.shared.agents()
        guard let agent = agents.first(where: {
            $0.name.localizedCaseInsensitiveContains(agentName)
        }) else {
            return .result(dialog: "I couldn't find an agent named \(agentName).")
        }
        try await WingmanAPI.shared.placeCall(
            agentId: agent.id,
            to: phoneNumber,
            context: context.isEmpty ? nil : context
        )
        return .result(dialog: "\(agent.name) is calling \(phoneNumber) now.")
    }
}
