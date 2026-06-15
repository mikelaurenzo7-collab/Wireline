import SwiftUI

/// The Calls tab — live calls on top, completed-call history below. Tapping a
/// recent call opens its recap detail. Backed by /api/mobile/calls/active and
/// /api/mobile/calls/recent.
struct CallsView: View {
    @EnvironmentObject private var router: WingmanRouter
    @State private var live: [ActiveCall] = []
    @State private var recent: [RecentCall] = []
    @State private var loadError: String?
    @State private var handoffError: String?
    @State private var showingSettings = false

    var body: some View {
        NavigationStack {
            Group {
                if let loadError, recent.isEmpty, live.isEmpty {
                    BrandEmptyState(title: "Couldn't load calls", message: loadError,
                                    systemImage: "wifi.exclamationmark")
                } else {
                    List {
                        // Live call banner — gradient card that floats above the
                        // recent list; visible without scrolling.
                        if !live.isEmpty {
                            Section {
                                ForEach(live) { call in
                                    LiveBannerCard(call: call,
                                        onTake: { Task { await takeCall(call) } },
                                        onView: { router.presentLiveCall(callId: call.callId) }
                                    )
                                    .listRowInsets(EdgeInsets(top: 8, leading: 16,
                                                              bottom: 4, trailing: 16))
                                    .listRowBackground(Color.clear)
                                    .listRowSeparator(.hidden)
                                }
                                if let err = handoffError {
                                    Text(err)
                                        .font(.caption)
                                        .foregroundStyle(Brand.destructive)
                                        .listRowBackground(Color.clear)
                                        .listRowSeparator(.hidden)
                                }
                            }
                        }

                        Section {
                            if recent.isEmpty {
                                BrandEmptyState(title: "No calls yet",
                                                message: "Completed calls and recaps show up here.",
                                                systemImage: "phone.down")
                                    .listRowBackground(Color.clear)
                                    .listRowSeparator(.hidden)
                            } else {
                                ForEach(recent) { call in
                                    NavigationLink { CallDetailView(call: call) } label: {
                                        RecentCallRow(call: call)
                                    }
                                }
                            }
                        } header: {
                            if !recent.isEmpty {
                                Text("Recent")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.secondary)
                                    .textCase(nil)
                            }
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Calls")
            .wingmanBrand()
            .sheet(isPresented: $showingSettings) { NavigationStack { SettingsView() } }
            .task { await load() }
            .refreshable { await load() }
        }
    }

    private func load() async {
        do {
            async let liveReq = WingmanAPI.shared.activeCalls()
            async let recentReq = WingmanAPI.shared.recentCalls(limit: 30)
            live = try await liveReq
            recent = try await recentReq.calls
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
            handoffError = "Add a callback number in Settings, then try again."
            showingSettings = true
        } catch let WingmanAPI.APIError.http(status, _) where status == 409 {
            handoffError = "Can't take over yet — try again in a moment."
        } catch {
            handoffError = "Couldn't take the call. Try again."
        }
    }
}

/// Gradient card shown when an agent call is live.
private struct LiveBannerCard: View {
    let call: ActiveCall
    let onTake: () -> Void
    let onView: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                // Pulsing live indicator
                LivePulse()

                VStack(alignment: .leading, spacing: 3) {
                    Text(call.customerNumber ?? "Active call")
                        .font(.headline).foregroundStyle(.white)
                    Text(call.label ?? call.status?.capitalized ?? "In progress")
                        .font(.caption).foregroundStyle(.white.opacity(0.6))
                }

                Spacer()

                Image(systemName: "waveform")
                    .foregroundStyle(.white.opacity(0.5))
                    .symbolEffect(.variableColor.iterative)
            }

            HStack(spacing: 10) {
                Button(action: onTake) {
                    Label("Take call", systemImage: "arrow.down.left.circle.fill")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 11)
                        .background(Brand.signal, in: Capsule())
                }
                .buttonStyle(.plain)

                Button(action: onView) {
                    Text("View")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 11)
                        .background(.white.opacity(0.15), in: Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(16)
        .background(
            LinearGradient(
                colors: [Brand.purple, Brand.purpleDeep],
                startPoint: .topLeading, endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 16)
        )
        .shadow(color: Brand.purple.opacity(0.4), radius: 16, y: 6)
    }
}

/// Animated pulsing dot for the live call indicator.
private struct LivePulse: View {
    @State private var pulsing = false

    var body: some View {
        ZStack {
            Circle()
                .fill(Brand.signal.opacity(pulsing ? 0 : 0.3))
                .frame(width: 32, height: 32)
                .scaleEffect(pulsing ? 1.6 : 1)
                .animation(.easeOut(duration: 1.0).repeatForever(autoreverses: false),
                           value: pulsing)
            Circle()
                .fill(Brand.signal)
                .frame(width: 12, height: 12)
        }
        .onAppear { pulsing = true }
    }
}

private struct RecentCallRow: View {
    let call: RecentCall

    var body: some View {
        HStack(spacing: 12) {
            // Direction badge
            ZStack {
                Circle().fill(Brand.accentTint).frame(width: 36, height: 36)
                Image(systemName: call.direction == "outbound"
                      ? "arrow.up.right" : "arrow.down.left")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Brand.purple)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(call.customerNumber ?? "Unknown").font(.headline)
                if let summary = call.summary {
                    Text(summary)
                        .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 5) {
                if let sentiment = call.sentiment {
                    SentimentDot(sentiment: sentiment)
                }
                if let d = call.durationSeconds, d > 0 {
                    Text(durationLabel(d))
                        .font(.caption2).foregroundStyle(.tertiary)
                }
            }
        }
        .padding(.vertical, 4)
    }

    private func durationLabel(_ seconds: Int) -> String {
        seconds < 60 ? "\(seconds)s" : "\(seconds / 60)m \(seconds % 60)s"
    }
}

private struct SentimentDot: View {
    let sentiment: String

    var color: Color {
        switch sentiment.lowercased() {
        case "positive": return Brand.signal
        case "negative": return Brand.destructive
        default: return Color.secondary
        }
    }

    var body: some View {
        Circle().fill(color).frame(width: 8, height: 8)
    }
}
