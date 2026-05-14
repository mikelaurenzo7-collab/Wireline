import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Hoist mocks so we can grab them inside the test.
// Mock the AuthContext values
const mockSignIn = vi.fn().mockResolvedValue({ error: null });
const mockRegister = vi.fn().mockResolvedValue({ error: null });
const mockRequestReset = vi.fn().mockResolvedValue({ error: null });

vi.mock("../AuthContext", () => ({
  useAuth: () => ({
    signIn: mockSignIn,
    register: mockRegister,
    requestPasswordReset: mockRequestReset,
    user: null,
    loading: false
  }),
}));

import AuthPortal from "../AuthPortal";

describe("AuthPortal — password reset flow", () => {
  beforeEach(() => {
    mockRequestReset.mockClear();
    mockSignIn.mockClear();
    mockRegister.mockClear();
  });

  it("shows 'Forgot?' link in sign-in mode", () => {
    render(<AuthPortal />);
    expect(screen.getByText("Forgot?")).toBeInTheDocument();
  });

  it("hides 'Forgot?' link in sign-up mode", () => {
    render(<AuthPortal />);
    fireEvent.click(screen.getByText("Sign Up"));
    expect(screen.queryByText("Forgot?")).not.toBeInTheDocument();
  });

  it("clicking 'Forgot?' switches to reset mode (no password field)", () => {
    render(<AuthPortal />);
    fireEvent.click(screen.getByText("Forgot?"));
    expect(screen.getByText("Reset password")).toBeInTheDocument();
    expect(screen.getByText("Send Reset Link")).toBeInTheDocument();
    // password input is gone
    expect(screen.queryByPlaceholderText("••••••••••••")).not.toBeInTheDocument();
  });

  it("submits reset request via supabase.auth.resetPasswordForEmail", async () => {
    render(<AuthPortal />);
    fireEvent.click(screen.getByText("Forgot?"));

    fireEvent.change(screen.getByPlaceholderText("operator@company.io"), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByText("Send Reset Link"));

    await waitFor(() => {
      expect(mockRequestReset).toHaveBeenCalledTimes(1);
    });
    expect(mockRequestReset).toHaveBeenCalledWith("user@example.com");
  });

  it("shows success message after reset request", async () => {
    render(<AuthPortal />);
    fireEvent.click(screen.getByText("Forgot?"));
    fireEvent.change(screen.getByPlaceholderText("operator@company.io"), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByText("Send Reset Link"));
    await waitFor(() => {
      expect(screen.getByText(/reset link is on its way/i)).toBeInTheDocument();
    });
  });

  it("blocks sign-up submission when password is shorter than 8 chars", async () => {
    render(<AuthPortal />);
    fireEvent.click(screen.getByText("Sign Up"));
    fireEvent.change(screen.getByPlaceholderText("operator@company.io"), {
      target: { value: "new@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("••••••••••••"), {
      target: { value: "short" },
    });
    fireEvent.click(screen.getByText("Create Account"));
    // Defense-in-depth: HTML5 minLength stops the form, and even if it
    // didn't, the JS handler short-circuits before signUp runs.
    await new Promise((r) => setTimeout(r, 50));
    expect(mockRegister).not.toHaveBeenCalled();
  });
});
