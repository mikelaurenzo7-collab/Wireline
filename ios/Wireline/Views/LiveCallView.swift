import SwiftUI

/// Full-screen active-call surface presented after a CallKit answer or from
/// Recaps. It is intentionally high-glanceability: Wireline's current state,
/// the person or service on the line, elapsed time, and two clear choices.
struct LiveCallView: View {
    @EnvironmentObject private var router: WirelineRouter

    let callId: String?

    @State private var call: ActiveCall?
    @State private var elapsed: TimeInterval = 0
    @State private var state: TransferState = .idle
    @State private var showingSettings = false
    @State private var didAutoHandoff = false

    private let ticker = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    enum TransferState {
        case idle
        case working
        case done
        case failed(String)
    }

    var body: some View {
        ZStack {
            Brand.canvas.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                Spacer(minLength: 20)
                activePulse
                    .padding(.bottom, 28)
                callSummary
                Spacer(minLength: 28)
                actionStack
                    .padding(.horizontal, 20)
                    .padding(.bottom, 32)
            }
        }
        .task { await refreshCall() }
        .task {
            guard router.liveCallAutoHandoff, !didAutoHandoff else { return }
            didAutoHandoff = true
            router.liveCallAutoHandoff = false
            await refreshCall()
            await transfer(retryOnConflict: true)
        }
        .onReceive(ticker) { _ in elapsed += 1 }
        .sheet(isPresented: $showingSettings) {
            NavigationStack { SettingsView() }
        }
    }

    private var header: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("ACTIVE CALL")
                    .font(.mono(.caption2, weight: .semibold))
                    .tracking(0.6)
                    .foregroundStyle(Brand.text3)
                Text("Wireline is handling this")
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(Brand.text)
            }
            Spacer()
            Button { router.dismissLiveCall() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Brand.text2)
                    .frame(width: 40, height: 40)
                    .background(Brand.panel, in: RoundedRectangle(cornerRadius: Brand.radiusMd, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: Brand.radiusMd, style: .continuous)
                            .stroke(Brand.border, lineWidth: 1)
                    )
            }
            .buttonStyle(TouchPressStyle())
            .accessibilityLabel("Close active call view")
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
    }

    private var activePulse: some View {
        ZStack {
            CallRing(scale: 2.2, delay: 0.0)
            CallRing(scale: 2.2, delay: 0.6)
            CallRing(scale: 2.2, delay: 1.2)
            Image(systemName: "waveform")
                .font(.system(size: 30, weight: .semibold))
                .foregroundStyle(Brand.accent)
                .frame(width: 88, height: 88)
                .background(Brand.accentSoft, in: Circle())
                .overlay(Circle().stroke(Brand.border, lineWidth: 1))
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Active Wireline call")
    }

    private var callSummary: some View {
        VStack(spacing: 12) {
            Text(call?.customerNumber ?? call?.label ?? "Active call")
                .font(.display(.title2, weight: .bold))
                .tracking(-0.4)
                .foregroundStyle(Brand.text)
                .multilineTextAlignment(.center)

            if let label = call?.label, !label.isEmpty, label != call?.customerNumber {
                Text(label)
                    .font(.subheadline)
                    .foregroundStyle(Brand.text2)
                    .multilineTextAlignment(.center)
            }

            HStack(spacing: 8) {
                metric(label: "Duration", value: timerLabel, systemImage: "timer")
                metric(label: "Status", value: statusLabel, systemImage: "waveform")
            }
            .padding(.top, 8)
        }
        .padding(.horizontal, 20)
    }

    private func metric(label: String, value: String, systemImage: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: systemImage)
                .font(.caption.weight(.semibold))
                .foregroundStyle(Brand.accent)
            VStack(alignment: .leading, spacing: 1) {
                Text(label)
                    .font(.mono(.caption2, weight: .semibold))
                    .tracking(0.45)
                    .foregroundStyle(Brand.text3)
                Text(value)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Brand.text)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Brand.panel, in: RoundedRectangle(cornerRadius: Brand.radiusMd, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Brand.radiusMd, style: .continuous)
                .stroke(Brand.border, lineWidth: 1)
        )
    }

    @ViewBuilder
    private var actionStack: some View {
        VStack(spacing: 10) {
            switch state {
            case .idle:
                takeButton

            case .working:
                HStack(spacing: 10) {
                    ProgressView().tint(.white)
                    Text("Connecting you to this call…")
                        .font(.headline)
                        .foregroundStyle(.white)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(Brand.accent, in: RoundedRectangle(cornerRadius: Brand.radiusMd, style: .continuous))

            case .done:
                HStack(spacing: 10) {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(Brand.signal)
                    Text("Call transferred")
                        .font(.headline)
                        .foregroundStyle(Brand.text)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(Brand.panel, in: RoundedRectangle(cornerRadius: Brand.radiusMd, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: Brand.radiusMd, style: .continuous)
                        .stroke(Brand.border, lineWidth: 1)
                )

            case .failed(let message):
                VStack(spacing: 10) {
                    Text(message)
                        .font(.footnote)
                        .foregroundStyle(Brand.destructive)
                        .multilineTextAlignment(.center)
                    takeButton
                }
            }

            Button { router.dismissLiveCall() } label: {
                Text("Keep handling it")
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(Brand.text)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 15)
                    .background(Brand.panel, in: RoundedRectangle(cornerRadius: Brand.radiusMd, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: Brand.radiusMd, style: .continuous)
                            .stroke(Brand.border, lineWidth: 1)
                    )
            }
            .buttonStyle(TouchPressStyle())
            .accessibilityHint("Closes this view and lets Wireline continue the call")
        }
    }

    private var takeButton: some View {
        Button { Task { await transfer() } } label: {
            Label("Take this call", systemImage: "arrow.down.left.circle.fill")
                .font(.headline)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(Brand.accent, in: RoundedRectangle(cornerRadius: Brand.radiusMd, style: .continuous))
        }
        .buttonStyle(TouchPressStyle())
        .accessibilityHint("Transfers the active Wireline call to your callback number")
    }

    private var timerLabel: String {
        let minutes = Int(elapsed) / 60
        let seconds = Int(elapsed) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }

    private var statusLabel: String {
        let raw = call?.status?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "In progress"
        guard !raw.isEmpty else { return "In progress" }
        return raw.replacingOccurrences(of: "_", with: " ").capitalized
    }

    private func refreshCall() async {
        let all = (try? await WirelineAPI.shared.activeCalls()) ?? []
        if let id = callId {
            call = all.first(where: { $0.callId == id }) ?? all.first
        } else {
            call = all.first
        }

        if let active = call {
            await WirelineCallLiveActivityManager.shared.update(
                callId: active.callId,
                caller: active.customerNumber ?? active.label,
                status: active.status,
                canTakeCall: true
            )
        }
    }

    private func transfer(retryOnConflict: Bool = false) async {
        state = .working
        let target = callId ?? call?.callId ?? ""
        guard !target.isEmpty else {
            state = .failed("No active call found. Refresh and try again.")
            return
        }
        do {
            try await WirelineAPI.shared.handoffCall(callId: target)
            await WirelineCallLiveActivityManager.shared.end(callId: target)
            state = .done
            try? await Task.sleep(for: .seconds(1.5))
            router.dismissLiveCall()
        } catch let WirelineAPI.APIError.http(status, _) where status == 400 {
            state = .failed("Set a callback number in Settings first.")
            showingSettings = true
        } catch let WirelineAPI.APIError.http(status, _) where status == 409 {
            if retryOnConflict {
                try? await Task.sleep(for: .seconds(1.5))
                await refreshCall()
                await transfer(retryOnConflict: false)
                return
            }
            state = .failed("Transfer is not ready yet. Wait a moment and try again.")
        } catch {
            state = .failed("Transfer failed. Try again.")
        }
    }
}

/// Expanding, low-contrast pulse for an active call. It deliberately uses the
/// semantic ametrine action token rather than the retired purple live treatment.
private struct CallRing: View {
    let scale: CGFloat
    let delay: Double

    @State private var animScale: CGFloat = 1
    @State private var animOpacity: Double = 0.32

    var body: some View {
        Circle()
            .stroke(Brand.accent.opacity(animOpacity), lineWidth: 1.5)
            .frame(width: 88, height: 88)
            .scaleEffect(animScale)
            .onAppear {
                withAnimation(
                    .easeOut(duration: 1.8)
                    .repeatForever(autoreverses: false)
                    .delay(delay)
                ) {
                    animScale = scale
                    animOpacity = 0
                }
            }
    }
}
