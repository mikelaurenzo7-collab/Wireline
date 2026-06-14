import Foundation

#if canImport(ActivityKit)
    import ActivityKit
#endif

/// Owns the in-call Live Activity lifecycle from the app side. `reconcile` is
/// idempotent: call it with the current active call (or nil) and it starts,
/// updates, or ends the activity to match — so repeated polls never spawn
/// duplicates. No-ops cleanly when Live Activities are disabled or unsupported.
///
/// Deployment target is iOS 17, so ActivityKit (16.1+) needs no availability
/// guards; the `#if canImport` keeps the file portable.
@MainActor
final class CallActivityController {
    static let shared = CallActivityController()
    private init() {}

    #if canImport(ActivityKit)
        private var current: Activity<WingmanCallActivityAttributes>?
        private var startedAt: Date?
    #endif

    /// Reconcile the live activity against the current active call.
    /// - Parameters:
    ///   - call: the single active call, or nil when there is none.
    ///   - agentName: resolved display name for the call's agent.
    func reconcile(call: ActiveCall?, agentName: String) {
        #if canImport(ActivityKit)
            guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }

            // Re-attach to an activity that outlived a cold launch.
            if current == nil { current = Activity<WingmanCallActivityAttributes>.activities.first }

            guard let call else {
                end()
                return
            }

            let isSameCall = current?.attributes.callId == call.callId
            // Preserve the original start time across updates so the timer is
            // continuous; reset it only when this is a different (or new) call.
            let started = (isSameCall ? startedAt : nil) ?? Date()
            let state = WingmanCallActivityAttributes.ContentState(
                phase: phase(from: call.status),
                detail: nil,
                startedAt: started
            )

            if let existing = current, isSameCall {
                startedAt = started
                Task { await existing.update(ActivityContent(state: state, staleDate: nil)) }
                return
            }

            // A different call is live (or none was tracked): retire any stale
            // activity, then start a fresh one.
            end()
            let attributes = WingmanCallActivityAttributes(
                callId: call.callId,
                agentName: agentName,
                peerLabel: call.label ?? call.customerNumber ?? "Caller"
            )
            do {
                current = try Activity.request(
                    attributes: attributes,
                    content: ActivityContent(state: state, staleDate: nil),
                    pushType: nil
                )
                startedAt = started
            } catch {
                // Authorization race / activity budget exhausted — never let a
                // Live Activity failure affect the call itself.
            }
        #endif
    }

    /// End the current activity, if any.
    func end() {
        #if canImport(ActivityKit)
            let toEnd = current
            current = nil
            startedAt = nil
            if let toEnd { Task { await toEnd.end(nil, dismissalPolicy: .immediate) } }
        #endif
    }

    /// Map a backend call status to a Live Activity phase (ringing/live/wrapping).
    private func phase(from status: String?) -> String {
        let s = (status ?? "").lowercased()
        if s.contains("ring") { return "ringing" }
        if s.contains("wrap") || s.contains("end") || s.contains("complete") { return "wrapping" }
        return "live"
    }
}
