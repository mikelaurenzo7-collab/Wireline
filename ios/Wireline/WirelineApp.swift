import SwiftUI
import UserNotifications

@main
struct WirelineApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var auth = AuthService()
    @StateObject private var router = WirelineRouter.shared

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
            .wirelineBrand()
            .onOpenURL { url in
                // wireline://ask (from a widget / Control Center) → Ask surface.
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
        // Standard alert pushes deliver call recaps + device actions.
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
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

extension AppDelegate: UNUserNotificationCenterDelegate {
    // Tapped notification → run the device action (open Maps, add reminder, …).
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        DeviceActionHandler.handle(response.notification.request.content.userInfo)
        completionHandler()
    }

    // Foreground delivery: still show the banner so the user can tap to act.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound])
    }
}
