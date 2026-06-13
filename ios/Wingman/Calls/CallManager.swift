import Foundation
import CallKit
import PushKit
import AVFoundation

/// Owns the CallKit provider and the PushKit (VoIP) registry. On launch the app
/// calls `registerForVoIPPushes()`; thereafter inbound-call VoIP pushes wake the
/// app and are turned into native CallKit calls — on the phone and in CarPlay.
final class CallManager: NSObject {
    static let shared = CallManager()

    private let provider: CXProvider
    private let callController = CXCallController()
    private var voipRegistry: PKPushRegistry?
    private let deviceId = (UIDevice.current.identifierForVendor?.uuidString) ?? UUID().uuidString
    /// Latest tokens (hex), cached so each registration sends BOTH — otherwise
    /// a VoIP-only or alert-only POST would null out the other column.
    private var lastVoipToken: String?
    private var lastAlertToken: String?

    override init() {
        let config = CXProviderConfiguration()
        config.supportsVideo = false
        config.maximumCallGroups = 1
        config.maximumCallsPerCallGroup = 1
        config.supportedHandleTypes = [.phoneNumber, .generic]
        provider = CXProvider(configuration: config)
        super.init()
        provider.setDelegate(self, queue: nil)
    }

    // MARK: - PushKit registration

    func registerForVoIPPushes() {
        let registry = PKPushRegistry(queue: .main)
        registry.delegate = self
        registry.desiredPushTypes = [.voIP]
        voipRegistry = registry
    }

    /// Cache the standard alert token (from APNs remote-notification
    /// registration) and re-register. Recap pushes are delivered to this token.
    func setAlertToken(_ token: String) {
        lastAlertToken = token
        Task { await pushRegistration() }
    }

    /// Re-register after a fresh sign-in (the tokens don't change, but the
    /// authenticated user they bind to does).
    func refreshDeviceRegistration() async {
        await pushRegistration()
    }

    /// POST both cached tokens together so neither overwrites the other.
    private func pushRegistration() async {
        guard lastVoipToken != nil || lastAlertToken != nil else { return }
        try? await WingmanAPI.shared.registerDevice(
            deviceId: deviceId, voipToken: lastVoipToken, alertToken: lastAlertToken
        )
    }

    /// Drop this device server-side on sign-out so it stops receiving pushes.
    func unregisterDevice() async {
        try? await WingmanAPI.shared.unregisterDevice(deviceId: deviceId)
    }

    // MARK: - Outbound (CallKit start)

    func startOutboundCall(to displayName: String, handle: String) {
        let cxHandle = CXHandle(type: .generic, value: handle)
        let action = CXStartCallAction(call: UUID(), handle: cxHandle)
        action.contactIdentifier = displayName
        callController.request(CXTransaction(action: action)) { error in
            if let error { NSLog("CallKit start failed: \(error.localizedDescription)") }
        }
    }
}

// MARK: - PKPushRegistryDelegate

extension CallManager: PKPushRegistryDelegate {
    func pushRegistry(_ registry: PKPushRegistry,
                      didUpdate pushCredentials: PKPushCredentials,
                      for type: PKPushType) {
        let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
        lastVoipToken = token
        Task { await pushRegistration() }
    }

    func pushRegistry(_ registry: PKPushRegistry,
                      didReceiveIncomingPushWith payload: PKPushPayload,
                      for type: PKPushType,
                      completion: @escaping () -> Void) {
        // CRITICAL: report a CallKit call immediately or iOS kills the app.
        let info = payload.dictionaryPayload
        let from = info["from"] as? String ?? "Unknown"
        let agentName = info["agentName"] as? String
        let callId = info["callId"] as? String ?? UUID().uuidString

        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .phoneNumber, value: from)
        update.localizedCallerName = agentName.map { "\($0) · \(from)" } ?? from
        update.hasVideo = false

        let uuid = UUID(uuidString: callId) ?? UUID()
        provider.reportNewIncomingCall(with: uuid, update: update) { _ in
            completion()
        }
    }
}

// MARK: - CXProviderDelegate

extension CallManager: CXProviderDelegate {
    func providerDidReset(_ provider: CXProvider) {}

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        configureAudioSession()
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
        configureAudioSession()
        action.fulfill()
    }

    private func configureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth])
        try? session.setActive(true)
    }
}
