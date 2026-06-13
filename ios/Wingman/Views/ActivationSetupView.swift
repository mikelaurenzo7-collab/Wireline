import SwiftUI

/// "Activate Wingman everywhere" — explains the regular-iPhone entry points and
/// how to wire the physical ones. Honest by design: apps can't claim the Action
/// button or Back Tap programmatically, so this screen guides the user to do it
/// in Settings. Siri phrases and widgets are auto-registered by App Shortcuts.
struct ActivationSetupView: View {
    var body: some View {
        List {
            Section {
                row("mic.fill", "Siri", "Say “Ask Wingman”, or “Ask Wingman what needs my attention.” Works the moment the app is installed — no setup.")
            } header: { Text("Hands-free") }

            Section {
                row("button.horizontal.top.press", "Action button", "On iPhone 15 Pro and later, set the Action button to run the “Ask Wingman” shortcut for a walkie-talkie feel.")
                row("hand.tap.fill", "Back Tap", "Double- or triple-tap the back of your iPhone to ask Wingman or start a call.")
                Button { openSettings() } label: {
                    Label("Open Settings to assign them", systemImage: "gear")
                }
                .tint(Brand.purple)
            } header: {
                Text("Physical triggers")
            } footer: {
                Text("Action button: Settings → Action Button → Shortcut → Ask Wingman.\nBack Tap: Settings → Accessibility → Touch → Back Tap.")
            }

            Section {
                row("rectangle.stack.fill", "Home & Lock Screen widgets", "Add a Wingman widget to start a request or review what needs attention at a glance.")
                row("slider.horizontal.3", "Control Center", "Add the Wingman control for one-tap access from anywhere.")
                Button { openShortcuts() } label: {
                    Label("Open the Shortcuts app", systemImage: "square.2.layers.3d")
                }
                .tint(Brand.purple)
            } header: { Text("Glanceable") }

            Section {
                HStack {
                    row("applewatch", "Apple Watch", "Ask or approve from your wrist.")
                    Spacer()
                    Text("Soon").font(.caption).foregroundStyle(.secondary)
                }
            } header: { Text("Coming soon") }
        }
        .navigationTitle("Activate everywhere")
        .navigationBarTitleDisplayMode(.inline)
        .wingmanBrand()
    }

    private func row(_ icon: String, _ title: String, _ detail: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .foregroundStyle(Brand.purple)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.headline)
                Text(detail).font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }

    private func openSettings() {
        if let url = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(url)
        }
    }

    private func openShortcuts() {
        if let url = URL(string: "shortcuts://"), UIApplication.shared.canOpenURL(url) {
            UIApplication.shared.open(url)
        }
    }
}

#Preview {
    NavigationStack { ActivationSetupView() }
}
