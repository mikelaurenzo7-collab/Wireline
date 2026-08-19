import ActivityKit
import Foundation

@MainActor
final class WirelineCallLiveActivityManager {
    static let shared = WirelineCallLiveActivityManager()

    private var activities: [String: Activity<WirelineCallActivityAttributes>] = [:]

    private init() {}

    func start(callId: String, caller: String, assistantName: String?, status: String = "In progress") {
        guard #available(iOS 16.1, *) else { return }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        guard activities[callId] == nil else { return }

        let assistant = assistantName?.trimmingCharacters(in: .whitespacesAndNewlines)
        let attributes = WirelineCallActivityAttributes(
            callId: callId,
            assistantName: (assistant?.isEmpty == false) ? assistant! : "BotBound"
        )
        let content = ActivityContent(
            state: WirelineCallActivityAttributes.ContentState(
                caller: caller,
                status: status,
                startedAt: Date(),
                canTakeCall: true
            ),
            staleDate: nil
        )

        do {
            let activity = try Activity<WirelineCallActivityAttributes>.request(
                attributes: attributes,
                content: content,
                pushType: nil
            )
            activities[callId] = activity
        } catch {
            NSLog("Live Activity start failed: \(error.localizedDescription)")
        }
    }

    func update(callId: String, caller: String?, status: String?, transcriptSnippet: String? = nil, canTakeCall: Bool = true) async {
        guard #available(iOS 16.1, *) else { return }
        guard let activity = activities[callId] else { return }
        let current = activity.content.state
        let next = WirelineCallActivityAttributes.ContentState(
            caller: clean(caller, fallback: current.caller),
            status: clean(status, fallback: current.status),
            transcriptSnippet: snippet(transcriptSnippet) ?? current.transcriptSnippet,
            startedAt: current.startedAt,
            canTakeCall: canTakeCall
        )
        await activity.update(ActivityContent(state: next, staleDate: nil))
    }

    func end(callId: String) async {
        guard #available(iOS 16.1, *) else { return }
        guard let activity = activities.removeValue(forKey: callId) else { return }
        await activity.end(nil, dismissalPolicy: .immediate)
    }

    func endAll() async {
        guard #available(iOS 16.1, *) else { return }
        let current = activities
        activities.removeAll()
        for activity in current.values {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }

    private func clean(_ value: String?, fallback: String) -> String {
        guard let text = value?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return fallback }
        return text.replacingOccurrences(of: "_", with: " ").capitalized
    }

    private func snippet(_ value: String?) -> String? {
        guard let text = value?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return nil }
        return String(text.prefix(180))
    }
}
