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
                Text("BotBound").font(.largeTitle.weight(.bold))
                Text("PUT YOUR BOT ON THE LINE")
                    .font(.headline.weight(.semibold))
                Text("Your Bot for calls, texts, and email.")
                    .font(.subheadline).foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("BotBound. Put your Bot on the line. Your Bot for calls, texts, and email.")

            VStack(spacing: 12) {
                TextField("EMAIL", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .padding(14)
                    .background(Brand.panel2, in: RoundedRectangle(cornerRadius: Brand.radiusMd))
                    .accessibilityLabel("Email address")

                SecureField("PASSWORD", text: $password)
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
                if auth.isWorking { ProgressView().tint(.white) } else { Text("SIGN IN") }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(auth.isWorking || email.isEmpty || password.isEmpty)
            .accessibilityLabel(auth.isWorking ? "Signing in" : "Sign in")
            .accessibilityHint("Signs in to your BotBound account")

            Spacer()
            Text("New to BotBound? Create an account on the web.")
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
