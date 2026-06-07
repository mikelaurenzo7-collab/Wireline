// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import OwnerOnlyRoute from "./OwnerOnlyRoute";

vi.mock("../contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "../contexts/AuthContext";

describe("OwnerOnlyRoute", () => {
  it("shows loading state while session hydrates", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      session: null,
      loading: true,
      signOut: async () => {},
      signIn: () => {},
    });

    render(
      <MemoryRouter>
        <OwnerOnlyRoute>
          <div>Secret founder surface</div>
        </OwnerOnlyRoute>
      </MemoryRouter>,
    );

    expect(screen.getByLabelText("Loading")).toBeTruthy();
    expect(screen.queryByText("Secret founder surface")).toBeNull();
  });

  it("redirects non-owners without rendering children", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "u1", email: "demo@trywireline.com", is_owner: false },
      session: null,
      loading: false,
      signOut: async () => {},
      signIn: () => {},
    });

    render(
      <MemoryRouter initialEntries={["/founder"]}>
        <OwnerOnlyRoute>
          <div>Secret founder surface</div>
        </OwnerOnlyRoute>
      </MemoryRouter>,
    );

    expect(screen.queryByText("Secret founder surface")).toBeNull();
  });

  it("renders children for platform owner", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "u1", email: "mikelaurenzo7@gmail.com", is_owner: true },
      session: null,
      loading: false,
      signOut: async () => {},
      signIn: () => {},
    });

    render(
      <MemoryRouter>
        <OwnerOnlyRoute>
          <div>Secret founder surface</div>
        </OwnerOnlyRoute>
      </MemoryRouter>,
    );

    expect(screen.getByText("Secret founder surface")).toBeTruthy();
  });
});
