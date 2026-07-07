import CarPlay
import UIKit

/// Driving-safe Communication template. CallKit remains responsible for native
/// call UI; this scene contains only high-glanceability active-call, callback,
/// and agent-line controls once Apple grants the CarPlay entitlement.
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
            let item = CPListItem(text: "Open Wireline on your phone to sign in", detailText: nil)
            return CPListTemplate(title: "Wireline", sections: [CPListSection(items: [item])])
        }
        let item = CPListItem(text: "Loading your calls…", detailText: nil)
        return CPListTemplate(title: "Wireline", sections: [CPListSection(items: [item])])
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
            let title = call.label ?? call.customerNumber ?? "Active call"
            let button = CPGridButton(
                titleVariants: [title, "Take call"],
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
                titleVariants: [formatPhone(number), "Call again"],
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
                titleVariants: ["Agents", "Choose a line"],
                image: symbol("person.2")
            ) { [weak self] _ in
                self?.showAgents(agents)
            }
            buttons.append(button)
        }

        if !buttons.isEmpty {
            let title = me.map { $0.account.businessName ?? $0.user.fullName ?? "Wireline" } ?? "Wireline"
            return CPGridTemplate(title: title, gridButtons: Array(buttons.prefix(8)))
        }

        let item = CPListItem(text: "No calls right now", detailText: "Ask Wireline on your phone")
        return CPListTemplate(title: "Wireline", sections: [CPListSection(items: [item])])
    }

    private func showAgents(_ agents: [Agent]) {
        let items = agents.map { agent -> CPListItem in
            let item = CPListItem(
                text: agent.name,
                detailText: agent.role?.replacingOccurrences(of: "_", with: " ").capitalized
            )
            item.handler = { [weak self] _, completion in
                self?.interfaceController?.popTemplate(animated: true, completion: nil)
                completion()
            }
            return item
        }
        let template = CPListTemplate(title: "Agents", sections: [CPListSection(items: items)])
        interfaceController?.pushTemplate(template, animated: true, completion: nil)
    }

    private func callBack(number: String, agentId: String?) async {
        guard let agentId else { return }
        _ = try? await WirelineAPI.shared.placeCall(
            agentId: agentId,
            to: number,
            context: nil,
            callPurpose: "callback",
            hasExpressWrittenConsent: false
        )
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
