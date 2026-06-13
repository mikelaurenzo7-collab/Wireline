import SwiftUI

@main
struct WingmanApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var auth = AuthService()
    @StateObject private var router = WingmanRouter.shared

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
            .environmentObject(router)
            .tint(Brand.purple)
            .onOpenURL { url in
                // wingman://ask (from a widget / Control Center) → Ask surface.
                if url.host == "ask" { router.showAsk = true }
            }
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
