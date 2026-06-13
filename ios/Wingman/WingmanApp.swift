import SwiftUI

@main
struct WingmanApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var auth = AuthService()

    var body: some Scene {
        WindowGroup {
            Group {
                if auth.isSignedIn {
                    WorkspaceView()
                } else {
                    SignInView()
                }
            }
            .environmentObject(auth)
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
