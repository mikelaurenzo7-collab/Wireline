import SwiftUI

@main
struct WingmanApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            WorkspaceView()
                .tint(Brand.purple)
        }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // Register for VoIP pushes so the backend can wake us on inbound calls.
        CallManager.shared.registerForVoIPPushes()
        return true
    }
}
