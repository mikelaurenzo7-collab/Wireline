import AppIntents
import SwiftUI

// The "regular iPhone" activation layer. App Intents are the single mechanism
// behind every entry point Apple exposes: Siri ("Ask Wireline…"), the Action
// button, Back Tap, Spotlight, Home/Lock-screen widgets, and Control Center.
// We expose a small set of approved actions; iOS surfaces them everywhere and
// the user wires the physical triggers in Settings (apps can't claim the
// Action button or Back Tap programmatically — that stays the user's choice).

/// "Ask Wireline" — the general entry point. Opens the app to the request
/// composer (the in-app big button presents the same surface).
struct AskWirelineIntent: AppIntent {
    static var title: LocalizedStringResource = "Ask Wireline"
    static var description = IntentDescription("Open Wireline to make a request.")
    static var openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        WirelineRouter.shared.showAsk = true
        return .result()
    }
}

/// "Have Wireline take this call" — transfers the current live call to the
/// user's saved callback number. Mirrors the in-app "Take this call" button
/// (LiveCallView/CallsView): infer the most recent live call and hand it off,
/// no parameters required so it works hands-free through Siri.
struct TakeThisCallIntent: AppIntent {
    static var title: LocalizedStringResource = "Take this call"
    static var description = IntentDescription("Wireline transfers your current live call to your saved callback number.")
    static var openAppWhenRun = false

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard KeychainStore.loadToken() != nil else {
            return .result(dialog: "Open Wireline and sign in first.")
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

/// "Summarize my last call" — reads the most recent completed call and speaks
/// its recap. Fully self-contained (no app launch needed).
struct SummarizeLastCallIntent: AppIntent {
    static var title: LocalizedStringResource = "Summarize my last call"
    static var description = IntentDescription("Wireline reads back a recap of your most recent call.")
    static var openAppWhenRun = false

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard KeychainStore.loadToken() != nil else {
            return .result(dialog: "Open Wireline and sign in first.")
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
            return .result(dialog: "I couldn't reach Wireline just now. Try again in a moment.")
        }
    }
}

/// "What needs my attention" — a spoken digest of recent activity + follow-ups.
struct WhatNeedsAttentionIntent: AppIntent {
    static var title: LocalizedStringResource = "What needs my attention"
    static var description = IntentDescription("Wireline summarizes recent calls that need follow-up.")
    static var openAppWhenRun = false

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard KeychainStore.loadToken() != nil else {
            return .result(dialog: "Open Wireline and sign in first.")
        }
        do {
            let recent = try await WirelineAPI.shared.recentCalls(limit: 20)
            if recent.calls.isEmpty {
                return .result(dialog: "Nothing needs your attention — no recent calls.")
            }
            let followups = recent.needsAttention
            if followups == 0 {
                return .result(dialog: "You're all caught up. \(recent.calls.count) recent calls, none flagged for follow-up.")
            }
            let plural = followups == 1 ? "call needs" : "calls need"
            return .result(dialog: "\(followups) \(plural) follow-up out of your \(recent.calls.count) recent calls.")
        } catch {
            return .result(dialog: "I couldn't reach Wireline just now. Try again in a moment.")
        }
    }
}

/// "Open Wireline" — foreground the app on the workspace.
struct OpenWirelineIntent: AppIntent {
    static var title: LocalizedStringResource = "Open Wireline"
    static var openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        WirelineRouter.shared.selectedTab = .workspace
        return .result()
    }
}

// MARK: - App Shortcuts (the auto-registered, no-setup phrases)

struct WirelineShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AskWirelineIntent(),
            phrases: [
                "Ask \(.applicationName)",
                "Hey \(.applicationName)",
                "Open \(.applicationName) and ask",
            ],
            shortTitle: "Ask Wireline",
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
            shortTitle: "Open Wireline",
            systemImageName: "rectangle.stack.fill"
        )
    }
}
