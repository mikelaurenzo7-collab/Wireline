import CarPlay
import UIKit

/// Driving-safe Communication template. CallKit remains responsible for native
/// call UI; this scene contains only high-glanceability active-call, callback,
/// and Bot-line controls once Apple grants the CarPlay entitlement.
final class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
    private var interfaceController: CPInterfaceController?

    func templateApplicationScene(
        _ scene: CPTemplateApplicationScene,
        didConnect interfaceController: CPInterfaceController
    ) {
        self.interfaceController = interfaceController
        interfaceController.setRootTemplate(loadingTemplate(), animated: false, completion: nil)
        Task { await refresh() }
    }

    func templateApplicationScene(
        _ scene: CPTemplateApplicationScene,
        didDisconnectInterfaceController interfaceController: CPInterfaceController
    ) {
        self.interfaceController = nil
    }

    private func loadingTemplate() -> CPListTemplate {
        if KeychainStore.loadToken() == nil {
            let item = CPListItem(text: "OPEN BOTBOUND ON YOUR PHONE TO SIGN IN", detailText: nil)
            return CPListTemplate(title: "BotBound", sections: [CPListSection(items: [item])])
        }
        let item = CPListItem(text: "LOADING YOUR CALLS…", detailText: nil)
        return CPListTemplate(title: "BotBound", sections: [CPListSection(items: [item])])
    }

    @MainActor
    private func refresh() async {
        guard KeychainStore.loadToken() != nil else { return }
        async let recentsRequest = WirelineAPI.shared.recentCalls(limit: 8)
        async let agentsRequest = WirelineAPI.shared.agents()
        async let activeRequest = WirelineAPI.shared.activeCalls()
        async let meRequest = WirelineAPI.shared.me()

        let recents = (try? await recentsRequest)?.calls ?? []
        let agents = (try? await agentsRequest) ?? []
        let active = (try? await activeRequest) ?? []
        let me = try? await meRequest

        let template = rootTemplate(me: me, activeCalls: active, recents: recents, agents: agents)
        interfaceController?.setRootTemplate(template, animated: true, completion: nil)
    }

    /// The full entitlement path uses a two-column grid: large enough for safe
    /// glances and taps, with no chat, long recap, billing, or setup surfaces.
    private func rootTemplate(
        me: MobileMe?,
        activeCalls: [ActiveCall],
        recents: [RecentCall],
        agents: [Agent]
    ) -> CPTemplate {
        var buttons: [CPGridButton] = []

        for call in activeCalls.prefix(4) {
            let title = call.label ?? call.customerNumber ?? "ACTIVE CALL"
            let button = CPGridButton(
                titleVariants: [title, "TAKE CALL"],
                image: symbol("waveform")
            ) { [weak self] _ in
                Task {
                    // Explicit, user-initiated CarPlay handoff. The backend still
                    // enforces callback-number and live-call eligibility checks.
                    try? await WirelineAPI.shared.handoffCall(callId: call.callId)
                    await self?.refresh()
                }
            }
            buttons.append(button)
        }

        for call in recents.compactMap({ $0.customerNumber == nil ? nil : $0 }).prefix(2) {
            guard let number = call.customerNumber else { continue }
            let button = CPGridButton(
                titleVariants: [formatPhone(number), "CALL AGAIN"],
                image: symbol("phone.arrow.up.right")
            ) { [weak self] _ in
                Task {
                    await self?.callBack(number: number, agentId: agents.first?.id)
                    await self?.refresh()
                }
            }
            buttons.append(button)
        }

        if !agents.isEmpty {
            let button = CPGridButton(
                titleVariants: ["BOTS", "CHOOSE A BOT"],
                image: symbol("waveform.and.person.filled")
            ) { [weak self] _ in
                self?.showBots(agents)
            }
            buttons.append(button)
        }

        if !buttons.isEmpty {
            let title = me.map { $0.account.businessName ?? $0.user.fullName ?? "BotBound" } ?? "BotBound"
            return CPGridTemplate(title: title, gridButtons: Array(buttons.prefix(8)))
        }

        let item = CPListItem(text: "NO CALLS RIGHT NOW", detailText: "ASK BOTBOUND ON YOUR PHONE")
        return CPListTemplate(title: "BotBound", sections: [CPListSection(items: [item])])
    }

    private func showBots(_ agents: [Agent]) {
        let items = agents.map { agent -> CPListItem in
            let normalizedRole = agent.role?
                .replacingOccurrences(of: "_", with: " ")
                .replacingOccurrences(of: "assistant", with: "Bot", options: .caseInsensitive)
                .capitalized
            let detail = normalizedRole.map { $0.lowercased().hasSuffix("bot") ? $0 : "\($0) Bot" } ?? "Voice Bot"
            let item = CPListItem(text: agent.name, detailText: detail)
            item.handler = { [weak self] _, completion in
                self?.interfaceController?.popTemplate(animated: true, completion: nil)
                completion()
            }
            return item
        }
        let template = CPListTemplate(title: "BOTS", sections: [CPListSection(items: items)])
        interfaceController?.pushTemplate(template, animated: true, completion: nil)
    }

    private func callBack(number: String, agentId: String?) async {
        guard let agentId else { return }
        do {
            _ = try await WirelineAPI.shared.placeCall(
                agentId: agentId,
                to: number,
                context: nil,
                callPurpose: "callback",
                permissionConfirmed: false,
                nonsalesConfirmed: false,
                salesAttestationConfirmed: false
            )
        } catch {
            // Native outbound is unavailable until the signed-permission client ships.
            // Swallowing the error used to look like a successful callback.
        }
    }

    private func symbol(_ name: String) -> UIImage {
        let config = UIImage.SymbolConfiguration(pointSize: 24, weight: .medium)
        let image = UIImage(systemName: name, withConfiguration: config)?
            .withTintColor(CarPlayPalette.wireUiColor, renderingMode: .alwaysOriginal)
        return image ?? UIImage()
    }

    private func formatPhone(_ raw: String) -> String {
        let digits = raw.filter(\.isNumber)
        guard digits.count == 11, digits.hasPrefix("1") else { return raw }
        let area = digits.dropFirst().prefix(3)
        let mid = digits.dropFirst(4).prefix(3)
        let last = digits.suffix(4)
        return "(\(area)) \(mid)-\(last)"
    }
}
