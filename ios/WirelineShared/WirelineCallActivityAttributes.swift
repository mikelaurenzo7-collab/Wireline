import ActivityKit
import Foundation

/// Shared app/widget contract for Wireline's active-call Live Activity.
/// Content stays deliberately factual: caller/service, current server state,
/// elapsed start time, and an optional real transcript snippet when available.
public struct WirelineCallActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var caller: String
        public var status: String
        public var transcriptSnippet: String?
        public var startedAt: Date
        public var canTakeCall: Bool

        public init(
            caller: String,
            status: String,
            transcriptSnippet: String? = nil,
            startedAt: Date = Date(),
            canTakeCall: Bool = true
        ) {
            self.caller = caller
            self.status = status
            self.transcriptSnippet = transcriptSnippet
            self.startedAt = startedAt
            self.canTakeCall = canTakeCall
        }
    }

    public let callId: String
    public let assistantName: String

    public init(callId: String, assistantName: String) {
        self.callId = callId
        self.assistantName = assistantName
    }
}
