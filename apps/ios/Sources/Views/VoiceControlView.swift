import SwiftUI

/// Voice Control template simulation - Phase 4 Polished
/// Voice-first, safe for driving. Aurora Cream aligned with clean bubbles and large action buttons.
struct VoiceControlView: View {
    @State private var isListening = false
    @State private var transcript = "What are today’s hot leads?"
    @State private var agentResponse = "You have 4 qualified leads today. The top one is Apex Software - interested in demo."
    
    var body: some View {
        VStack(spacing: 28) {  // Improved breathing room
            // Header
            HStack(spacing: 12) {
                Image(systemName: isListening ? "waveform" : "mic.fill")
                    .font(.largeTitle)
                    .foregroundColor(.purple)
                Text(isListening ? "Listening..." : "Talking to your SDR Agent...")
                    .font(.headline)
                    .foregroundColor(.primary)
            }
            
            // Conversation bubbles
            VStack(alignment: .leading, spacing: 16) {
                Text(transcript)
                    .padding(16)
                    .background(Color(.systemGray5))
                    .cornerRadius(18)
                    .font(.body)
                    
                Text(agentResponse)
                    .padding(16)
                    .background(Color.purple.opacity(0.12))
                    .cornerRadius(18)
                    .font(.body)
            }
            
            // Safe action buttons - large targets
            HStack(spacing: 12) {
                Button("Call Lead") {
                    // Trigger backend / CallKit
                }
                .buttonStyle(.borderedProminent)
                .tint(.purple)
                .controlSize(.large)
                
                Button("Add Note") {
                    // Log note
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
                
                Button("End") {
                    isListening = false
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
            }
            
            Spacer()
        }
        .padding(24)
        .background(Color(.systemBackground))
    }
}
