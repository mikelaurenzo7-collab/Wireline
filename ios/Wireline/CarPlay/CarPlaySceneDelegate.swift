import CarPlay

/// Driving-safe Communication template. CallKit remains responsible for native
/// call UI; this scene surfaces only glanceable active-call state, recent
/// callbacks, and the assistants available to help.
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
        async let assistantsRequest = WirelineAPI.shared.agents()
        async let activeRequest = WirelineAPI.shared.activeCalls()
        async let meRequest = WirelineAPI.shared.me()

        let recents = (try? await recentsRequest)?.calls ?? []
        let assistants = (try? await assistantsRequest) ?? []
        let active = (try? await activeRequest) ?? []
        let me = try? await meRequest

        let template = rootTemplate(me: me, activeCalls: active, recents: recents, assistants: assistants)
        interfaceController?.setRootTemplate(template, animated: true, completion: nil)
    }

    private func rootTemplate(
        me: MobileMe?,
        activeCalls: [ActiveCall],
        recents: [RecentCall],
        assistants: [Agent]
    ) -> CPListTemplate {
        var sections: [CPListSection] = []

        if let me {
            let label = me.account.businessName ?? me.user.fullName ?? me.user.email
            let accountItem = CPListItem(text: label, detailText: me.account.planName)
            accountItem.isEnabled = false
            sections.append(CPListSection(items: [accountItem], header: "Your Wireline", sectionIndexTitle: nil))
        }

        if !activeCalls.isEmpty {
            let items = activeCalls.map { call -> CPListItem in
                let title = call.customerNumber ?? call.label ?? "Wireline call"
                let detail = call.status?.replacingOccurrences(of: "_", with: " ").capitalized ?? "In progress"
                let item = CPListItem(text: title, detailText: detail)
                item.isEnabled = false
                return item
            }
            sections.append(CPListSection(items: items, header: "Handling now", sectionIndexTitle: nil))
        }

        let callBackItems: [CPListItem] = recents.compactMap { call in
            guard let number = call.customerNumber else { return nil }
            let item = CPListItem(text: formatPhone(number), detailText: shortSummary(call.summary))
            item.handler = { [weak self] _, completion in
                Task {
                    await self?.callBack(number: number, assistantId: assistants.first?.id)
                    completion()
                }
            }
            return item
        }
        if !callBackItems.isEmpty {
            sections.append(CPListSection(items: callBackItems, header: "Call again", sectionIndexTitle: nil))
        }

        let assistantItems = assistants.map { assistant in
            CPListItem(
                text: assistant.name,
                detailText: assistant.role?.replacingOccurrences(of: "_", with: " ").capitalized
            )
        }
        if !assistantItems.isEmpty {
            sections.append(CPListSection(items: assistantItems, header: "Assistants", sectionIndexTitle: nil))
        }

        if sections.isEmpty {
            sections = [CPListSection(items: [CPListItem(text: "No recent calls", detailText: "Ask Wireline on your phone")])]
        }

        return CPListTemplate(title: "Wireline", sections: sections)
    }

    private func callBack(number: String, assistantId: String?) async {
        guard let assistantId else { return }
        _ = try? await WirelineAPI.shared.placeCall(agentId: assistantId, to: number, context: nil)
    }

    private func formatPhone(_ raw: String) -> String {
        let digits = raw.filter(\.isNumber)
        guard digits.count == 11, digits.hasPrefix("1") else { return raw }
        let area = digits.dropFirst().prefix(3)
        let mid = digits.dropFirst(4).prefix(3)
        let last = digits.suffix(4)
        return "(\(area)) \(mid)-\(last)"
    }

    private func shortSummary(_ summary: String?) -> String? {
        guard let summary, !summary.isEmpty else { return nil }
        if summary.count <= 48 { return summary }
        return String(summary.prefix(45)) + "…"
    }
}
