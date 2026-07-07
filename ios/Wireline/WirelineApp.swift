import SwiftUI
import UserNotifications

@main
struct WirelineApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @Environment(\.scenePhase) private var scenePhase
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
                router.open(url: url)
            }
            .task {
                if auth.isSignedIn {
                    await WidgetSync.refresh()
                }
            }
            .onChange(of: scenePhase) { _, phase in
                guard phase == .active, auth.isSignedIn else { return }
                Task { await WidgetSync.refresh() }
            }
            .onChange(of: auth.isSignedIn) { _, signedIn in
                Task {
                    if signedIn {
                        await WidgetSync.refresh()
                    } else {
                        WidgetSync.saveSignedOut()
                    }
                }
            }
            .onReceive(NotificationCenter.default.publisher(for: .wirelineSessionExpired)) { _ in
                auth.signOut()
            }
        }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        CallManager.shared.registerForVoIPPushes()
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
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        DeviceActionHandler.handle(response.notification.request.content.userInfo)
        completionHandler()
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound])
    }
}
