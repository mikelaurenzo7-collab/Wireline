import SwiftUI

@main
struct WirelineCarPlayApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

struct ContentView: View {
    var body: some View {
        TabView {
            CarPlayWidgetView()
                .tabItem {
                    Label("Agents", systemImage: "brain.head.profile")
                }
            
            VoiceControlView()
                .tabItem {
                    Label("Voice", systemImage: "waveform")
                }
        }
        .accentColor(Color.purple) // Subtle brand accent
    }
}
