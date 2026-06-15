import SwiftUI

/// Recap detail for one completed call. Shows summary, outcome, sentiment,
/// transcript, and — when available — a recording link.
struct CallDetailView: View {
    let call: RecentCall
    @State private var full: CallDetail?

    var body: some View {
        List {
            // Header: direction + caller + duration
            Section {
                HStack(spacing: 14) {
                    Medallion(
                        systemImage: call.direction == "outbound"
                            ? "arrow.up.right" : "arrow.down.left"
                    )
                    VStack(alignment: .leading, spacing: 3) {
                        Text(call.customerNumber ?? "Unknown").font(.headline)
                        Text((call.direction ?? "call").capitalized + durationSuffix)
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 2)
            }

            // AI summary
            if let summary = call.summary, !summary.isEmpty {
                Section("Summary") {
                    Text(summary).font(.callout)
                }
            }

            // Structured metadata
            Section("Details") {
                if let outcome = call.outcomeTag {
                    detailRow("Outcome") {
                        OutcomeTag(tag: outcome)
                    }
                }
                if let sentiment = call.sentiment {
                    detailRow("Sentiment") {
                        HStack(spacing: 6) {
                            Circle()
                                .fill(sentimentColor(sentiment))
                                .frame(width: 8, height: 8)
                            Text(sentiment.capitalized)
                                .font(.callout)
                        }
                    }
                }
                if let intent = call.intentLabel, intent != "none" {
                    detailRow("Intent") {
                        Text(intent
                            .replacingOccurrences(of: "_", with: " ")
                            .capitalized
                        )
                        .font(.callout)
                    }
                }
            }

            // Recording (if backend returned a URL)
            if let url = full?.recordingUrl, let link = URL(string: url) {
                Section {
                    Link(destination: link) {
                        Label("Play recording", systemImage: "play.circle.fill")
                            .foregroundStyle(Brand.purple)
                    }
                }
            }

            // Full transcript (lazy-loaded)
            if let transcript = full?.transcript, !transcript.isEmpty {
                Section("Transcript") {
                    Text(transcript)
                        .font(.callout)
                        .textSelection(.enabled)
                }
            }
        }
        .navigationTitle("Call recap")
        .navigationBarTitleDisplayMode(.inline)
        .wirelineBrand()
        .task { full = try? await WirelineAPI.shared.callDetail(id: call.id) }
    }

    private var durationSuffix: String {
        guard let s = call.durationSeconds, s > 0 else { return "" }
        return " · \(s / 60)m \(s % 60)s"
    }

    private func sentimentColor(_ sentiment: String) -> Color {
        switch sentiment.lowercased() {
        case "positive": return Brand.signal
        case "negative": return Brand.destructive
        default: return .secondary
        }
    }

    @ViewBuilder
    private func detailRow<V: View>(_ label: String, @ViewBuilder value: () -> V) -> some View {
        HStack {
            Text(label).foregroundStyle(.secondary)
            Spacer()
            value()
        }
        .font(.callout)
    }
}

/// Colored pill for the call outcome label.
private struct OutcomeTag: View {
    let tag: String

    private var color: Color {
        switch tag.lowercased() {
        case "booked", "converted", "completed": return Brand.signal
        case "objection", "no_answer", "voicemail": return Color.orange
        case "transferred": return Brand.purple
        default: return Color.secondary
        }
    }

    var body: some View {
        Text(tag.replacingOccurrences(of: "_", with: " ").capitalized)
            .font(.caption.weight(.semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.12), in: Capsule())
    }
}
