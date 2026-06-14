import SwiftUI

/// The Calls tab — live calls on top, completed-call history below. Tapping a
/// recent call opens its recap detail. Backed by /api/mobile/calls/active and
/// /api/mobile/calls/recent.
struct CallsView: View {
    @State private var live: [ActiveCall] = []
    @State private var recent: [RecentCall] = []
    @State private var loadError: String?
    @State private var handoffError: String?

    var body: some View {
        NavigationStack {
            Group {
                if let loadError, recent.isEmpty, live.isEmpty {
                    BrandEmptyState(title: "Couldn't load calls", message: loadError,
                                    systemImage: "wifi.exclamationmark")
                } else {
                    List {
                        if !live.isEmpty {
                            Section("Live") {
                                ForEach(live) { call in
                                    VStack(alignment: .leading, spacing: 8) {
                                        CallCard(call: call)
                                        Button {
                                            Task { await takeCall(call) }
                                        } label: {
                                            Label("Take this call", systemImage: "arrow.down.left.circle.fill")
                                        }
                                        .buttonStyle(.borderedProminent)
                                        .tint(Brand.purple)
                                        .controlSize(.small)
                                    }
                                }
                            }
                            if let handoffError {
                                Text(handoffError).font(.caption).foregroundStyle(Brand.destructive)
                            }
                        }
                        Section("Recent") {
                            if recent.isEmpty {
                                BrandEmptyState(title: "No calls yet",
                                                message: "Completed calls and recaps show up here.",
                                                systemImage: "phone.down")
                            } else {
                                ForEach(recent) { call in
                                    NavigationLink { CallDetailView(call: call) } label: {
                                        RecentCallRow(call: call)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Calls")
            .wingmanBrand()
            .task { await load() }
            .refreshable { await load() }
        }
    }

    private func load() async {
        do {
            async let liveCall = WingmanAPI.shared.activeCalls()
            async let recentCall = WingmanAPI.shared.recentCalls(limit: 30)
            live = try await liveCall
            recent = try await recentCall.calls
            loadError = nil
        } catch {
            loadError = error.localizedDescription
        }
    }

    private func takeCall(_ call: ActiveCall) async {
        handoffError = nil
        do {
            try await WingmanAPI.shared.handoffCall(callId: call.callId)
            await load()
        } catch let WingmanAPI.APIError.http(status, _) where status == 400 {
            handoffError = "Set a callback number in Settings first, then try again."
        } catch let WingmanAPI.APIError.http(status, _) where status == 409 {
            handoffError = "This call can't be taken over yet — try again in a moment."
        } catch {
            handoffError = "Couldn't take the call. Try again."
        }
    }
}

private struct RecentCallRow: View {
    let call: RecentCall

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: call.direction == "outbound" ? "arrow.up.right" : "arrow.down.left")
                .foregroundStyle(Brand.purple)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(call.customerNumber ?? "Unknown").font(.headline)
                if let summary = call.summary {
                    Text(summary).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
            }
            Spacer()
            if let tag = call.outcomeTag, tag != "other" {
                Text(tag.capitalized)
                    .font(.caption2.weight(.semibold))
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(Brand.accentTint, in: Capsule())
                    .foregroundStyle(Brand.purple)
            }
        }
        .padding(.vertical, 2)
    }
}
