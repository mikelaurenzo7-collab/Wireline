import AppIntents
import SwiftUI

// The "regular iPhone" activation layer. App Intents are the single mechanism
// behind every entry point Apple exposes: Siri ("Ask Wingman…"), the Action
// button, Back Tap, Spotlight, Home/Lock-screen widgets, and Control Center.
// We expose a small set of approved actions; iOS surfaces them everywhere and
// the user wires the physical triggers in Settings (apps can't claim the
// Action button or Back Tap programmatically — that stays the user's choice).

/// "Ask Wingman" — the general entry point. Opens the app to the request
/// composer (the in-app big button presents the same surface).
struct AskWingmanIntent: AppIntent {
    static var title: LocalizedStringResource = "Ask Wingman"
    static var description = IntentDescription("Open Wingman to make an everyday call request.")
    static var openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        WingmanRouter.shared.route = .ask
        return .result()
    }
}

/// "Have Wingman take this" — transfers the latest eligible live call to the
/// user's saved callback number. This is intentionally narrow: it does not
/// browse calls or expose transcripts from Siri/CarPlay; it just performs the
/// active communication handoff the user explicitly requested.
struct TakeThisCallIntent: AppIntent {
    static var title: LocalizedStringResource = "Have Wingman take this"
    static var description = IntentDescription("Transfer your latest live Wingman call to your callback number.")
    static var openAppWhenRun = false

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard KeychainStore.loadToken() != nil else {
            return .result(dialog: "Open Wingman and sign in first.")
        }
        do {
            let activeCalls = try await WingmanAPI.shared.activeCalls()
            guard let call = activeCalls.first else {
                return .result(dialog: "I don't see a live call to take over right now.")
            }
            try await WingmanAPI.shared.handoffCall(callId: call.callId)
            let label = call.label ?? call.customerNumber ?? "that call"
            return .result(dialog: "I'm transferring \(label) to you now.")
        } catch WingmanAPI.APIError.http(status: 400, body: _) {
            return .result(dialog: "Add your callback number in Wingman settings, then try again.")
        } catch WingmanAPI.APIError.http(status: 404, body: _) {
            return .result(dialog: "That live call is no longer available.")
        } catch WingmanAPI.APIError.http(status: 409, body: _) {
            return .result(dialog: "That call can't be transferred yet.")
        } catch {
            return .result(dialog: "I couldn't reach Wingman just now. Try again in a moment.")
        }
    }
}

/// "Summarize my last call" — reads the most recent completed call and speaks
/// its recap. Fully self-contained (no app launch needed).
struct SummarizeLastCallIntent: AppIntent {
    static var title: LocalizedStringResource = "Summarize my last call"
    static var description = IntentDescription("Wingman reads back a recap of your most recent call.")
    static var openAppWhenRun = false

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard KeychainStore.loadToken() != nil else {
            return .result(dialog: "Open Wingman and sign in first.")
        }
        do {
            let recent = try await WingmanAPI.shared.recentCalls(limit: 1)
            guard let call = recent.calls.first else {
                return .result(dialog: "You don't have any calls yet.")
            }
            let who = call.customerNumber ?? "an unknown number"
            let summary = call.summary ?? "No summary is available for that call."
            return .result(dialog: "Your last call with \(who): \(summary)")
        } catch {
            return .result(dialog: "I couldn't reach Wingman just now. Try again in a moment.")
        }
    }
}

/// "What needs my attention" — a spoken digest of recent activity + follow-ups.
struct WhatNeedsAttentionIntent: AppIntent {
    static var title: LocalizedStringResource = "What needs my attention"
    static var description = IntentDescription("Wingman summarizes recent calls that need follow-up.")
    static var openAppWhenRun = false

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard KeychainStore.loadToken() != nil else {
            return .result(dialog: "Open Wingman and sign in first.")
        }
        do {
            let recent = try await WingmanAPI.shared.recentCalls(limit: 20)
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
            return .result(dialog: "I couldn't reach Wingman just now. Try again in a moment.")
        }
    }
}

/// "Open Wingman" — foreground the app on the workspace.
struct OpenWingmanIntent: AppIntent {
    static var title: LocalizedStringResource = "Open Wingman"
    static var openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        WingmanRouter.shared.route = .workspace
        return .result()
    }
}

// MARK: - App Shortcuts (the auto-registered, no-setup phrases)

struct WingmanShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AskWingmanIntent(),
            phrases: [
                "Ask \(.applicationName)",
                "Hey \(.applicationName)",
                "Open \(.applicationName) and ask",
            ],
            shortTitle: "Ask Wingman",
            systemImageName: "mic.fill"
        )
        AppShortcut(
            intent: CallAgentIntent(),
            phrases: [
                "Have \(.applicationName) place a call",
                "Tell \(.applicationName) to call someone",
                "Have \(.applicationName) call the doctor",
                "Ask \(.applicationName) to make a call",
            ],
            shortTitle: "Place a call",
            systemImageName: "phone.arrow.up.right"
        )

        AppShortcut(
            intent: TakeThisCallIntent(),
            phrases: [
                "Have \(.applicationName) take this",
                "Ask \(.applicationName) to take this call",
                "Tell \(.applicationName) to transfer this call to me",
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
            intent: OpenWingmanIntent(),
            phrases: ["Open \(.applicationName)"],
            shortTitle: "Open Wingman",
            systemImageName: "rectangle.stack.fill"
        )
    }
}
