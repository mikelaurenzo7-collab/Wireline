import SwiftUI

/// Full-screen active-call overlay presented when the operator answers a CallKit
/// call from the lock-screen or taps "View" on a live call in CallsView.
/// Shows who's on the line, an elapsed timer, and two clear actions: transfer
/// the call to the operator's number, or let the AI agent keep handling it.
struct LiveCallView: View {
    @EnvironmentObject private var router: WirelineRouter

    let callId: String?

    @State private var call: ActiveCall?
    @State private var elapsed: TimeInterval = 0
    @State private var state: TransferState = .idle
    @State private var showingSettings = false

    private let ticker = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    enum TransferState {
        case idle
        case working
        case done
        case failed(String)
    }

    var body: some View {
        ZStack {
            // Deep purple → near-black gradient
            LinearGradient(
                colors: [Brand.purpleDeep, Color(hex: 0x0D0120)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                // Dismiss handle at top
                dismissBar

                Spacer()

                // Pulsing call indicator
                callIndicator
                    .padding(.bottom, 36)

                // Caller details
                callerInfo

                Spacer()

                // Action buttons
                actionStack
                    .padding(.horizontal, 28)
                    .padding(.bottom, 48)
            }
        }
        .task { await refreshCall() }
        .onReceive(ticker) { _ in elapsed += 1 }
        .sheet(isPresented: $showingSettings) {
            NavigationStack { SettingsView() }
        }
    }

    // MARK: - Subviews

    private var dismissBar: some View {
        HStack {
            Spacer()
            Button { router.dismissLiveCall() } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 28))
                    .foregroundStyle(.white.opacity(0.35))
                    .padding(20)
            }
        }
    }

    private var callIndicator: some View {
        ZStack {
            CallRing(scale: 2.6, delay: 0.0)
            CallRing(scale: 2.6, delay: 0.6)
            CallRing(scale: 2.6, delay: 1.2)
            Medallion(systemImage: "phone.fill", size: 88)
                .shadow(color: Brand.purple.opacity(0.7), radius: 28)
        }
    }

    private var callerInfo: some View {
        VStack(spacing: 8) {
            Text(call?.customerNumber ?? "Active call")
                .font(.system(size: 36, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)

            if let label = call?.label, !label.isEmpty {
                Text(label)
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.55))
            }

            Text(timerLabel)
                .font(.system(size: 15, weight: .regular, design: .monospaced))
                .foregroundStyle(.white.opacity(0.38))
                .padding(.top, 4)
        }
        .padding(.horizontal, 28)
    }

    @ViewBuilder
    private var actionStack: some View {
        VStack(spacing: 14) {
            switch state {
            case .idle:
                takeButton

            case .working:
                HStack { Spacer(); ProgressView().tint(.white); Spacer() }
                    .frame(height: 56)

            case .done:
                HStack(spacing: 10) {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(Brand.signal)
                    Text("Transferred").font(.headline).foregroundStyle(.white)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 18)

            case .failed(let msg):
                VStack(spacing: 10) {
                    Text(msg)
                        .font(.footnote)
                        .foregroundStyle(Brand.destructive)
                        .multilineTextAlignment(.center)
                    takeButton
                }
            }

            Button { router.dismissLiveCall() } label: {
                Text("Let agent handle it")
                    .font(.callout.weight(.medium))
                    .foregroundStyle(.white.opacity(0.55))
                    .padding(.vertical, 12)
            }
        }
    }

    private var takeButton: some View {
        Button { Task { await transfer() } } label: {
            Label("Take this call", systemImage: "arrow.down.left.circle.fill")
                .font(.headline)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 18)
                .background(Brand.signal, in: Capsule())
                .shadow(color: Brand.signal.opacity(0.5), radius: 14, y: 4)
        }
    }

    // MARK: - Logic

    private var timerLabel: String {
        let m = Int(elapsed) / 60
        let s = Int(elapsed) % 60
        return String(format: "%d:%02d", m, s)
    }

    private func refreshCall() async {
        let all = (try? await WirelineAPI.shared.activeCalls()) ?? []
        if let id = callId {
            call = all.first(where: { $0.callId == id }) ?? all.first
        } else {
            call = all.first
        }
    }

    private func transfer() async {
        state = .working
        let target = callId ?? call?.callId ?? ""
        guard !target.isEmpty else {
            state = .failed("No active call found. Refresh and try again.")
            return
        }
        do {
            try await WirelineAPI.shared.handoffCall(callId: target)
            state = .done
            try? await Task.sleep(for: .seconds(1.5))
            router.dismissLiveCall()
        } catch let WirelineAPI.APIError.http(s, _) where s == 400 {
            state = .failed("Set a callback number in Settings first.")
            showingSettings = true
        } catch let WirelineAPI.APIError.http(s, _) where s == 409 {
            state = .failed("Transfer not ready yet — wait a moment and try again.")
        } catch {
            state = .failed("Transfer failed. Try again.")
        }
    }
}

/// Expanding translucent ring for the live-call pulse animation.
private struct CallRing: View {
    let scale: CGFloat
    let delay: Double

    @State private var animScale: CGFloat = 1
    @State private var animOpacity: Double = 0.4

    var body: some View {
        Circle()
            .stroke(Brand.purple.opacity(animOpacity), lineWidth: 1.5)
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
