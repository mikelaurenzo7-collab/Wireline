import SwiftUI

/// Voice Control template simulation for agent conversations
/// Inspired by CPVoiceControlTemplate and our earlier mockups.
/// Voice-first design with clear prompts and safe action buttons.
struct VoiceControlView: View {
    @State private var isListening = false
    @State private var transcript = "What are today’s hot leads?"
    @State private var agentResponse = "You have 4 qualified leads today. The top one is Apex Software - interested in demo."
    
    var body: some View {
        VStack(spacing: 24) {
            // Status header
            HStack {
                Image(systemName: isListening ? "waveform" : "mic")
                    .font(.largeTitle)
                    .foregroundColor(.purple)
                Text(isListening ? "Listening..." : "Talking to your SDR Agent...")
                    .font(.headline)
            }
            
            // Transcript bubbles
            VStack(alignment: .leading, spacing: 12) {
                Text(transcript)
                    .padding()
                    .background(Color(.systemGray5))
                    .cornerRadius(16)
                    
                Text(agentResponse)
                    .padding()
                    .background(Color.purple.opacity(0.1))
                    .cornerRadius(16)
            }
            
            // Safe action buttons
            HStack(spacing: 12) {
                Button("Call Lead") {
                    // Trigger backend handoff or CallKit
                }
                .buttonStyle(.borderedProminent)
                .tint(.purple)
                
                Button("Add Note") {
                    // Log to backend
                }
                .buttonStyle(.bordered)
                
                Button("End Call") {
                    isListening = false
                }
                .buttonStyle(.bordered)
            }
            
            Spacer()
        }
        .padding()
        .onAppear {
            // In real impl: Connect to CarPlay Voice Control template
        }
    }
}
