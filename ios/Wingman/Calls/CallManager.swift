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
    /// Latest VoIP token (hex), cached so we can re-register after sign-in.
    private var lastVoipToken: String?

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

    /// Re-POST the cached VoIP token after a fresh sign-in (the token itself
    /// doesn't change on sign-in, but the authenticated user it binds to does).
    func refreshDeviceRegistration() async {
        guard let token = lastVoipToken else { return }
        try? await WingmanAPI.shared.registerDevice(
            deviceId: deviceId, voipToken: token, alertToken: nil
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
        Task {
            try? await WingmanAPI.shared.registerDevice(
                deviceId: deviceId, voipToken: token, alertToken: nil
            )
        }
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
