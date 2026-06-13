import SwiftUI
import UserNotifications

@main
struct WingmanApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var auth = AuthService()
    @StateObject private var router = WingmanRouter.shared

    var body: some Scene {
        WindowGroup {
            Group {
                if auth.isSignedIn {
                    RootTabView()
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
        // VoIP pushes (PushKit) wake us on inbound calls.
        CallManager.shared.registerForVoIPPushes()
        // Standard alert pushes deliver call recaps when backgrounded.
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            guard granted else { return }
            DispatchQueue.main.async { application.registerForRemoteNotifications() }
        }
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        CallManager.shared.setAlertToken(token)
    }
}
