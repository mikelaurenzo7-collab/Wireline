import WidgetKit

/// Timeline entry carrying the App Group snapshot the app last wrote.
struct SnapshotEntry: TimelineEntry {
    let date: Date
    let snapshot: WingmanWidgetSnapshot
}

/// Shared provider for all data-backed Wingman widgets. It reads the snapshot
/// from the App Group (written by the app's `WidgetSync`) and schedules a
/// modest refresh cadence; the app also force-reloads timelines on data change,
/// so this is just a backstop.
struct SnapshotProvider: TimelineProvider {
    func placeholder(in context: Context) -> SnapshotEntry {
        SnapshotEntry(date: Date(), snapshot: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (SnapshotEntry) -> Void) {
        let snapshot = context.isPreview ? .placeholder : WingmanWidgetStore.load()
        completion(SnapshotEntry(date: Date(), snapshot: snapshot))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SnapshotEntry>) -> Void) {
        let entry = SnapshotEntry(date: Date(), snapshot: WingmanWidgetStore.load())
        // Backstop refresh; the app reloads timelines on every data change.
        let next = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date()
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}
