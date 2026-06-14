import Foundation

#if canImport(ActivityKit)
    import ActivityKit

    /// Live Activity describing an in-progress Wingman call. Shared between the
    /// app (which starts / updates / ends it) and the widget extension (which
    /// renders the Lock Screen banner + Dynamic Island).
    ///
    /// `ContentState` is the part that changes over the life of the call; the
    /// non-state attributes are fixed for the call's duration. (Deployment
    /// target is iOS 17, so no availability guard is needed.)
    public struct WingmanCallActivityAttributes: ActivityAttributes {
        public struct ContentState: Codable, Hashable {
            /// "ringing" | "live" | "wrapping" — drives the dot color + label.
            public var phase: String
            /// Short, glanceable detail (never a long transcript).
            public var detail: String?
            /// When the call connected — powers the live on-screen timer.
            public var startedAt: Date

            public init(phase: String, detail: String? = nil, startedAt: Date) {
                self.phase = phase
                self.detail = detail
                self.startedAt = startedAt
            }
        }

        public var callId: String
        public var agentName: String
        /// Who the call is with — customer number or label.
        public var peerLabel: String

        public init(callId: String, agentName: String, peerLabel: String) {
            self.callId = callId
            self.agentName = agentName
            self.peerLabel = peerLabel
        }
    }
#endif
