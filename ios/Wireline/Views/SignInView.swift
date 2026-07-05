import SwiftUI

struct SignInView: View {
    @EnvironmentObject private var auth: AuthService
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Medallion(systemImage: "phone.connection.fill", size: 72)
            VStack(spacing: 6) {
                Text("Wireline").font(.largeTitle.weight(.bold))
                Text("Your call agent, built around your rules.")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Wireline, your call agent, built around your rules")

            VStack(spacing: 12) {
                TextField("Email", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .padding(14)
                    .background(Brand.panel2, in: RoundedRectangle(cornerRadius: Brand.radiusMd))
                    .accessibilityLabel("Email address")

                SecureField("Password", text: $password)
                    .textContentType(.password)
                    .submitLabel(.go)
                    .padding(14)
                    .background(Brand.panel2, in: RoundedRectangle(cornerRadius: Brand.radiusMd))
                    .accessibilityLabel("Password")
                    .onSubmit {
                        guard !email.isEmpty, !password.isEmpty, !auth.isWorking else { return }
                        Task { await auth.signIn(email: email, password: password) }
                    }
            }

            if let error = auth.errorMessage {
                Text(error).font(.footnote).foregroundStyle(Brand.destructive)
            }

            Button {
                Task { await auth.signIn(email: email, password: password) }
            } label: {
                if auth.isWorking { ProgressView().tint(.white) } else { Text("Sign in") }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(auth.isWorking || email.isEmpty || password.isEmpty)
            .accessibilityLabel(auth.isWorking ? "Signing in" : "Sign in")
            .accessibilityHint("Signs in to your Wireline account")

            Spacer()
            Text("New to Wireline? Create an account on the web.")
                .font(.caption).foregroundStyle(.secondary)
        }
        .padding(24)
        .background(Brand.canvas.ignoresSafeArea())
        .tint(Brand.accent)
    }
}

#Preview {
    SignInView().environmentObject(AuthService())
}
