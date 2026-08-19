import AppIntents
import SwiftUI

// The regular iPhone activation layer. App Intents are the single mechanism
// behind every entry point Apple exposes: Siri, the Action button, Back Tap,
// Spotlight, Home/Lock-screen widgets, and Control Center.

struct AskWirelineIntent: AppIntent {
    static var title: LocalizedStringResource = "Ask BotBound"
    static var description = IntentDescription("Open BotBound to make a request.")
    static var openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        WirelineRouter.shared.showAsk = true
        return .result()
    }
}

struct TakeThisCallIntent: AppIntent {
    static var title: LocalizedStringResource = "Take this call"
    static var description = IntentDescription("BotBound transfers your current live call to your saved callback number.")
    static var openAppWhenRun = false

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard KeychainStore.loadToken() != nil else {
            return .result(dialog: "Open BotBound and sign in first.")
        }
        do {
            let calls = try await WirelineAPI.shared.activeCalls()
            guard let call = calls.first else {
                return .result(dialog: "You don't have a live call to take right now.")
            }
            try await WirelineAPI.shared.handoffCall(callId: call.callId)
            return .result(dialog: "Connecting you to that call now.")
        } catch let WirelineAPI.APIError.http(status, _) where status == 400 {
            return .result(dialog: "Add a callback number in Settings, then try again.")
        } catch let WirelineAPI.APIError.http(status, _) where status == 409 {
            return .result(dialog: "You can't take over yet. Try again in a moment.")
        } catch {
            return .result(dialog: "I couldn't take that call right now. Try again in a moment.")
        }
    }
}

struct SummarizeLastCallIntent: AppIntent {
    static var title: LocalizedStringResource = "Summarize my last call"
    static var description = IntentDescription("BotBound reads back a recap of your most recent call.")
    static var openAppWhenRun = false

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard KeychainStore.loadToken() != nil else {
            return .result(dialog: "Open BotBound and sign in first.")
        }
        do {
            let recent = try await WirelineAPI.shared.recentCalls(limit: 1)
            guard let call = recent.calls.first else {
                return .result(dialog: "You don't have any calls yet.")
            }
            let who = call.customerNumber ?? "an unknown number"
            let summary = call.summary ?? "No summary is available for that call."
            return .result(dialog: "Your last call with \(who): \(summary)")
        } catch {
            return .result(dialog: "I couldn't reach BotBound just now. Try again in a moment.")
        }
    }
}

struct WhatNeedsAttentionIntent: AppIntent {
    static var title: LocalizedStringResource = "What needs my attention"
    static var description = IntentDescription("BotBound summarizes recent calls that need follow-up.")
    static var openAppWhenRun = false

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard KeychainStore.loadToken() != nil else {
            return .result(dialog: "Open BotBound and sign in first.")
        }
        do {
            let recent = try await WirelineAPI.shared.recentCalls(limit: 20)
            if recent.calls.isEmpty {
                return .result(dialog: "Nothing needs your attention. No recent calls.")
            }
            let followups = recent.needsAttention
            if followups == 0 {
                return .result(dialog: "You're all caught up. \(recent.calls.count) recent calls, none flagged for follow-up.")
            }
            let plural = followups == 1 ? "call needs" : "calls need"
            return .result(dialog: "\(followups) \(plural) follow-up out of your \(recent.calls.count) recent calls.")
        } catch {
            return .result(dialog: "I couldn't reach BotBound just now. Try again in a moment.")
        }
    }
}

struct OpenWirelineIntent: AppIntent {
    static var title: LocalizedStringResource = "Open BotBound"
    static var openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        WirelineRouter.shared.selectedTab = .workspace
        return .result()
    }
}

struct WirelineShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AskWirelineIntent(),
            phrases: [
                "Ask \(.applicationName)",
                "Hey \(.applicationName)",
                "Open \(.applicationName) and ask",
            ],
            shortTitle: "Ask BotBound",
            systemImageName: "mic.fill"
        )
        AppShortcut(
            intent: CallAgentIntent(),
            phrases: [
                "Have \(.applicationName) place a call",
                "Tell \(.applicationName) to call someone",
            ],
            shortTitle: "Place a call",
            systemImageName: "phone.arrow.up.right"
        )
        AppShortcut(
            intent: TakeThisCallIntent(),
            phrases: [
                "Have \(.applicationName) take this",
                "Have \(.applicationName) take this call",
            ],
            shortTitle: "Take this call",
            systemImageName: "phone.arrow.down.left"
        )
        AppShortcut(
            intent: SummarizeLastCallIntent(),
            phrases: [
                "Ask \(.applicationName) to summarize my last call",
                "What did my last \(.applicationName) call say",
            ],
            shortTitle: "Summarize last call",
            systemImageName: "text.bubble"
        )
        AppShortcut(
            intent: WhatNeedsAttentionIntent(),
            phrases: [
                "Ask \(.applicationName) what needs my attention",
                "\(.applicationName) what needs my attention",
            ],
            shortTitle: "What needs attention",
            systemImageName: "bell.badge"
        )
        AppShortcut(
            intent: OpenWirelineIntent(),
            phrases: ["Open \(.applicationName)"],
            shortTitle: "Open BotBound",
            systemImageName: "rectangle.stack.fill"
        )
    }
}
