import AppIntents

/// "Hey Siri, tell BotBound to call the doctor, I'll be five minutes late."
///
/// Resolves a Bot by name and hands a free-text instruction to the backend,
/// which builds the Bot's system prompt and dials through the managed phone runtime.
/// No prompt logic runs on the device.
struct CallAgentIntent: AppIntent {
    static var title: LocalizedStringResource = "Have a Bot place a call"
    static var description = IntentDescription(
        "Asks a BotBound Bot to call someone with an optional instruction."
    )
    // Opening the app is unnecessary — this runs in the background via Siri.
    static var openAppWhenRun = false

    @Parameter(title: "Bot")
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
            return .result(dialog: "Open BotBound and sign in first.")
        }
        do {
            let agents = try await WirelineAPI.shared.agents()
            guard let agent = agents.first(where: {
                $0.name.localizedCaseInsensitiveContains(agentName)
            }) else {
                return .result(dialog: "I couldn't find a Bot named \(agentName).")
            }
            try await WirelineAPI.shared.placeCall(
                agentId: agent.id,
                to: phoneNumber,
                context: context.isEmpty ? nil : context,
                callPurpose: "appointment_service",
                permissionConfirmed: false,
                nonsalesConfirmed: false,
                salesAttestationConfirmed: false
            )
            return .result(dialog: "\(agent.name) is calling \(phoneNumber) now.")
        } catch let WirelineAPI.APIError.http(status, _) where status == 401 || status == 403 {
            return .result(dialog: "Your session has expired. Open BotBound to sign in again.")
        } catch let WirelineAPI.APIError.http(status, _) where status == 503 {
            return .result(dialog: "Calling from Siri is not available yet. Open BotBound in the browser to place this call.")
        } catch {
            return .result(dialog: "I couldn't place that call right now. Try again in a moment.")
        }
    }
}
