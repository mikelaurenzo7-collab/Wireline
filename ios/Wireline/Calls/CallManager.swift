import Foundation
import UIKit
import CallKit
import PushKit
import AVFoundation

/// Owns the CallKit provider and PushKit registry. VoIP pushes wake the app and
/// become native CallKit calls; the same lifecycle starts and ends Wireline's
/// high-glanceability Live Activity when the platform permits it.
final class CallManager: NSObject {
    static let shared = CallManager()

    private struct PendingCall {
        let callId: String
        let caller: String
        let assistantName: String?
    }

    private let provider: CXProvider
    private let callController = CXCallController()
    private var voipRegistry: PKPushRegistry?
    private let deviceId = (UIDevice.current.identifierForVendor?.uuidString) ?? UUID().uuidString
    private var lastVoipToken: String?
    private var lastAlertToken: String?
    private var pendingCalls: [UUID: PendingCall] = [:]

    override init() {
        // `CXProviderConfiguration()` reads the name from the bundle and makes
        // `localizedName` get-only; the old settable form came with the
        // `init(localizedName:)` deprecated in iOS 14. Info.plist already
        // carries CFBundleDisplayName = "Wireline", so the call UI shows the
        // same name it did, from one source instead of two.
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

    func setAlertToken(_ token: String) {
        lastAlertToken = token
        Task { await pushRegistration() }
    }

    func refreshDeviceRegistration() async {
        await pushRegistration()
    }

    private func pushRegistration() async {
        guard lastVoipToken != nil || lastAlertToken != nil else { return }
        try? await WirelineAPI.shared.registerDevice(
            deviceId: deviceId, voipToken: lastVoipToken, alertToken: lastAlertToken
        )
    }

    func unregisterDevice() async {
        try? await WirelineAPI.shared.unregisterDevice(deviceId: deviceId)
        await WirelineCallLiveActivityManager.shared.endAll()
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
        // Report a CallKit call promptly after a VoIP push so iOS can preserve
        // the system call experience.
        let info = payload.dictionaryPayload
        let caller = info["from"] as? String ?? "Unknown"
        let assistantName = info["agentName"] as? String
        let callId = info["callId"] as? String ?? UUID().uuidString

        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .phoneNumber, value: caller)
        update.localizedCallerName = assistantName.map { "\($0) · \(caller)" } ?? caller
        update.hasVideo = false

        let uuid = UUID(uuidString: callId) ?? UUID()
        pendingCalls[uuid] = PendingCall(callId: callId, caller: caller, assistantName: assistantName)
        provider.reportNewIncomingCall(with: uuid, update: update) { _ in
            completion()
        }
    }
}

// MARK: - CXProviderDelegate

extension CallManager: CXProviderDelegate {
    func providerDidReset(_ provider: CXProvider) {
        let existing = pendingCalls.values.map(\.callId)
        pendingCalls.removeAll()
        Task { @MainActor in
            for callId in existing {
                await WirelineCallLiveActivityManager.shared.end(callId: callId)
            }
        }
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        configureAudioSession()
        let pending = pendingCalls[action.callUUID]
        action.fulfill()

        Task { @MainActor in
            if let pending {
                WirelineCallLiveActivityManager.shared.start(
                    callId: pending.callId,
                    caller: pending.caller,
                    assistantName: pending.assistantName
                )
                // CallKit answer means the operator is taking the live call on their phone.
                WirelineRouter.shared.presentLiveCall(callId: pending.callId, autoHandoff: true)
            } else {
                WirelineRouter.shared.presentLiveCall(callId: nil)
            }
        }
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        let pending = pendingCalls.removeValue(forKey: action.callUUID)
        action.fulfill()
        Task { @MainActor in
            if let callId = pending?.callId {
                await WirelineCallLiveActivityManager.shared.end(callId: callId)
            }
            WirelineRouter.shared.dismissLiveCall()
        }
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
