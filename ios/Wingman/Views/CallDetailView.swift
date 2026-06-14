import SwiftUI

/// Recap detail for one completed call. Shows what we have from
/// /api/mobile/calls/recent (summary, outcome, sentiment, duration, direction).
struct CallDetailView: View {
    let call: RecentCall
    @State private var full: CallDetail?

    var body: some View {
        List {
            Section {
                HStack(spacing: 12) {
                    Medallion(systemImage: call.direction == "outbound"
                              ? "arrow.up.right" : "arrow.down.left")
                    VStack(alignment: .leading, spacing: 2) {
                        Text(call.customerNumber ?? "Unknown").font(.headline)
                        Text((call.direction ?? "call").capitalized + durationSuffix)
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
            }

            if let summary = call.summary, !summary.isEmpty {
                Section("Summary") { Text(summary).font(.callout) }
            }

            Section("Details") {
                if let outcome = call.outcomeTag { detail("Outcome", outcome.capitalized) }
                if let sentiment = call.sentiment { detail("Sentiment", sentiment.capitalized) }
                if let intent = call.intentLabel, intent != "none" {
                    detail("Intent", intent.replacingOccurrences(of: "_", with: " ").capitalized)
                }
            }

            if let transcript = full?.transcript, !transcript.isEmpty {
                Section("Transcript") {
                    Text(transcript).font(.callout).textSelection(.enabled)
                }
            }
        }
        .navigationTitle("Call recap")
        .navigationBarTitleDisplayMode(.inline)
        .wingmanBrand()
        .task { full = try? await WingmanAPI.shared.callDetail(id: call.id) }
    }

    private var durationSuffix: String {
        guard let s = call.durationSeconds, s > 0 else { return "" }
        return " · \(s / 60)m \(s % 60)s"
    }

    private func detail(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).foregroundStyle(.secondary)
            Spacer()
            Text(value)
        }
        .font(.callout)
    }
}
