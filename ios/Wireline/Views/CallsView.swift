import SwiftUI

/// Call recaps are the native replacement for the retired Live Ops surface:
/// active calls appear first, followed by plain-language completed-call recaps.
struct CallsView: View {
    @EnvironmentObject private var router: WirelineRouter
    @State private var live: [ActiveCall] = []
    @State private var recent: [RecentCall] = []
    @State private var loadError: String?
    @State private var handoffError: String?
    @State private var showingSettings = false

    var body: some View {
        NavigationStack {
            Group {
                if let loadError, recent.isEmpty, live.isEmpty {
                    BrandEmptyState(
                        title: "Couldn't load recaps",
                        message: loadError,
                        systemImage: "wifi.exclamationmark"
                    )
                } else {
                    List {
                        if !live.isEmpty {
                            Section {
                                ForEach(live) { call in
                                    LiveCallCard(
                                        call: call,
                                        onTake: { Task { await takeCall(call) } },
                                        onView: { router.presentLiveCall(callId: call.callId) }
                                    )
                                    .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 4, trailing: 16))
                                    .listRowBackground(Color.clear)
                                    .listRowSeparator(.hidden)
                                }
                                if let handoffError {
                                    Text(handoffError)
                                        .font(.caption)
                                        .foregroundStyle(Brand.destructive)
                                        .listRowBackground(Color.clear)
                                        .listRowSeparator(.hidden)
                                }
                            } header: {
                                Text("On a call")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(Brand.text3)
                                    .textCase(nil)
                            }
                        }

                        Section {
                            if recent.isEmpty {
                                BrandEmptyState(
                                    title: "No calls yet",
                                    message: "Completed calls and recaps will show up here.",
                                    systemImage: "phone.down"
                                )
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
                                Text("Recent recaps")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(Brand.text3)
                                    .textCase(nil)
                            }
                        }
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                }
            }
            .navigationTitle("Recaps")
            .wirelineBrand()
            .sheet(isPresented: $showingSettings) { NavigationStack { SettingsView() } }
            .task { await load() }
            .refreshable { await load() }
        }
    }

    private func load() async {
        do {
            async let liveRequest = WirelineAPI.shared.activeCalls()
            async let recentRequest = WirelineAPI.shared.recentCalls(limit: 30)
            live = try await liveRequest
            recent = try await recentRequest.calls
            loadError = nil
        } catch {
            loadError = error.localizedDescription
        }
    }

    private func takeCall(_ call: ActiveCall) async {
        handoffError = nil
        do {
            try await WirelineAPI.shared.handoffCall(callId: call.callId)
            await load()
        } catch let WirelineAPI.APIError.http(status, _) where status == 400 {
            handoffError = "Add a callback number in Settings, then try again."
            showingSettings = true
        } catch let WirelineAPI.APIError.http(status, _) where status == 409 {
            handoffError = "Can't take over yet — try again in a moment."
        } catch {
            handoffError = "Couldn't take the call. Try again."
        }
    }
}

private struct LiveCallCard: View {
    let call: ActiveCall
    let onTake: () -> Void
    let onView: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                LivePulse()
                VStack(alignment: .leading, spacing: 3) {
                    Text(call.customerNumber ?? "Active call")
                        .font(.headline)
                        .foregroundStyle(Brand.text)
                    Text(call.label ?? call.status?.capitalized ?? "In progress")
                        .font(.caption)
                        .foregroundStyle(Brand.text2)
                }
                Spacer()
                Image(systemName: "waveform")
                    .foregroundStyle(Brand.accent)
                    .symbolEffect(.variableColor.iterative)
            }

            HStack(spacing: 8) {
                Button(action: onTake) {
                    Label("Take call", systemImage: "arrow.down.left.circle.fill")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(Brand.accent, in: RoundedRectangle(cornerRadius: Brand.radiusSm, style: .continuous))
                }
                .buttonStyle(TouchPressStyle())

                Button(action: onView) {
                    Text("View")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Brand.text)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(Brand.panel2, in: RoundedRectangle(cornerRadius: Brand.radiusSm, style: .continuous))
                }
                .buttonStyle(TouchPressStyle())
            }
        }
        .padding(16)
        .brandGlowCard()
    }
}

private struct LivePulse: View {
    @State private var pulsing = false

    var body: some View {
        ZStack {
            Circle()
                .fill(Brand.signal.opacity(pulsing ? 0 : 0.28))
                .frame(width: 28, height: 28)
                .scaleEffect(pulsing ? 1.5 : 1)
                .animation(.easeOut(duration: 1.1).repeatForever(autoreverses: false), value: pulsing)
            Circle()
                .fill(Brand.signal)
                .frame(width: 8, height: 8)
        }
        .onAppear { pulsing = true }
    }
}

private struct RecentCallRow: View {
    let call: RecentCall

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(Brand.accentTint).frame(width: 36, height: 36)
                Image(systemName: call.direction == "outbound" ? "arrow.up.right" : "arrow.down.left")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Brand.accent)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(call.customerNumber ?? "Unknown")
                    .font(.headline)
                    .foregroundStyle(Brand.text)
                if let summary = call.summary {
                    Text(summary)
                        .font(.caption)
                        .foregroundStyle(Brand.text2)
                        .lineLimit(1)
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 5) {
                if let sentiment = call.sentiment {
                    SentimentDot(sentiment: sentiment)
                }
                if let duration = call.durationSeconds, duration > 0 {
                    Text(durationLabel(duration))
                        .font(.caption2)
                        .foregroundStyle(Brand.text3)
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
        default: return Brand.text3
        }
    }

    var body: some View {
        Circle().fill(color).frame(width: 8, height: 8)
    }
}
