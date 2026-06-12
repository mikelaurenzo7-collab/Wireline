import SwiftUI

/// Basic polished iPhone companion app Dashboard
/// Phase 4 polish - Aurora Cream aligned, clean and professional.
struct DashboardView: View {
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    // Header
                    HStack {
                        Text("Good afternoon")
                            .font(.largeTitle.bold())
                        Spacer()
                        Image(systemName: "person.crop.circle")
                            .font(.largeTitle)
                    }
                    
                    // Quick Stats
                    HStack(spacing: 16) {
                        StatCard(title: "Active Agents", value: "3", icon: "brain.head.profile")
                        StatCard(title: "Today's Calls", value: "12", icon: "phone")
                    }
                    
                    // Quick Actions
                    Text("Quick Actions")
                        .font(.headline)
                    
                    VStack(spacing: 12) {
                        Button("Talk to SDR Agent") { }
                            .buttonStyle(.borderedProminent)
                            .tint(.purple)
                            .frame(maxWidth: .infinity)
                            .controlSize(.large)
                        
                        Button("Check Pipeline") { }
                            .buttonStyle(.bordered)
                            .frame(maxWidth: .infinity)
                            .controlSize(.large)
                    }
                    
                    Spacer()
                }
                .padding()
            }
            .navigationTitle("Wireline")
        }
    }
}

struct StatCard: View {
    let title: String
    let value: String
    let icon: String
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: icon)
                Text(title)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            Text(value)
                .font(.title.bold())
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.systemGray6))
        .cornerRadius(16)
    }
}
