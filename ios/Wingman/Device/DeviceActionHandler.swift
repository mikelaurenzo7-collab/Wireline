import Foundation
import UIKit
import EventKit

/// Executes in-call device actions dispatched by the agent over push
/// (type "device_action"). The app can only *launch* other apps — it opens
/// Maps / Music and writes an EventKit reminder; it can't drive their UI.
enum DeviceActionHandler {
    static func handle(_ userInfo: [AnyHashable: Any]) {
        guard userInfo["type"] as? String == "device_action" else { return }
        let action = userInfo["action"] as? String ?? ""
        let args = userInfo["args"] as? [String: Any] ?? [:]

        switch action {
        case "navigate":
            if let dest = args["destination"] as? String { openMaps(to: dest) }
        case "play_music":
            if let query = args["query"] as? String { openMusic(query: query) }
        case "reminder":
            if let title = args["title"] as? String {
                addReminder(title: title, isoDate: args["datetime"] as? String)
            }
        default:
            break
        }
    }

    private static func openMaps(to destination: String) {
        let q = destination.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        if let url = URL(string: "http://maps.apple.com/?daddr=\(q)&dirflg=d") {
            UIApplication.shared.open(url)
        }
    }

    private static func openMusic(query: String) {
        let q = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        // Apple Music search; swap for a Spotify URL scheme if you ship that SDK.
        if let url = URL(string: "https://music.apple.com/search?term=\(q)") {
            UIApplication.shared.open(url)
        }
    }

    private static func addReminder(title: String, isoDate: String?) {
        let store = EKEventStore()
        let create: (Bool) -> Void = { granted in
            guard granted else { return }
            let event = EKEvent(eventStore: store)
            event.title = title
            let start = isoDate.flatMap { ISO8601DateFormatter().date(from: $0) }
                ?? Date().addingTimeInterval(3600)
            event.startDate = start
            event.endDate = start.addingTimeInterval(1800)
            event.calendar = store.defaultCalendarForNewEvents
            event.addAlarm(EKAlarm(relativeOffset: 0))
            try? store.save(event, span: .thisEvent)
        }
        if #available(iOS 17.0, *) {
            store.requestWriteOnlyAccessToEvents { granted, _ in create(granted) }
        } else {
            store.requestAccess(to: .event) { granted, _ in create(granted) }
        }
    }
}
